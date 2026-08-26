"""Cleans up a user's remembered facts (app/services/memory_service.py):
merges near-duplicates and resolves contradictions - keeping the newer fact -
via one LLM pass over everything currently remembered about them.

`remember()` already supersedes a fact against its single closest existing
match at write time, but that per-write check misses anything that isn't
each other's nearest neighbor (three independently-phrased duplicates, a
contradiction that doesn't embed close enough) - this is the deeper,
whole-corpus cleanup pass for what that misses.

Not automatic on purpose - matches scripts/backup.sh and
scripts/run_evals.py's "manual only" design, and it deletes memory entries,
so it always shows the full plan and asks for typed confirmation before
changing anything, the same as scripts/restore.sh does before its own
destructive step.

Usage:
    python -m scripts.consolidate_memories --username <existing-username>
"""

import argparse
import sys

from app.ai.model_factory import build_chat_model
from app.core.encryption import decrypt_secret
from app.db.session import SessionLocal
from app.repositories import credential_repo, user_repo
from app.services import memory_service
from app.services.memory_service import ConsolidationAction


def _print_plan(plan: list[ConsolidationAction]) -> None:
    for i, action in enumerate(plan, start=1):
        print(f"\nGroup {i}:")
        for entry in action.remove_entries:
            print(f"  - remove [{entry.category.value}] {entry.content}")
        if action.replacement is not None:
            content, category = action.replacement
            print(f"  + keep   [{category.value}] {content}")
        else:
            print("  (nothing to replace it with - now obsolete)")


def main(username: str) -> int:
    db = SessionLocal()
    try:
        user = user_repo.get_by_username(db, username)
        if user is None:
            print(f"No user named '{username}' found.", file=sys.stderr)
            return 1

        credential = credential_repo.get_any_usable_credential(db, user.id)
        if credential is None:
            print(f"'{username}' has no usable API connection - add one in API Connections first.", file=sys.stderr)
            return 1

        api_key = decrypt_secret(credential.encrypted_api_key)
        chat_model = build_chat_model(credential.provider, credential.model_name, api_key)

        before_count = len(memory_service.list_memories(db, user.id))
        print(
            f"Reviewing {before_count} remembered fact(s) for '{username}' "
            f"using {credential.provider.value}/{credential.model_name}..."
        )

        plan = memory_service.plan_consolidation(db, user.id, chat_model)
        if not plan:
            print("Nothing to clean up - no duplicates or contradictions found.")
            return 0

        _print_plan(plan)
        total_removed = sum(len(a.remove_entries) for a in plan)
        total_created = sum(1 for a in plan if a.replacement is not None)
        after_count = before_count - total_removed + total_created
        print(
            f"\nThis will remove {total_removed} entries and add {total_created} merged replacement(s) "
            f"- {before_count} -> {after_count} total."
        )

        confirm = input("Type 'yes' to apply: ").strip()
        if confirm != "yes":
            print("Aborted - no changes made.")
            return 1

        summary = memory_service.apply_consolidation(db, user.id, plan)
        print(f"Done. Removed {summary['removed']}, added {summary['created']}.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Clean up a user's remembered facts via one LLM consolidation pass.")
    parser.add_argument("--username", required=True, help="Existing user whose memories to consolidate")
    args = parser.parse_args()
    sys.exit(main(args.username))

import streamlit as st

import api_client
import session


def _render_add_form(token: str) -> None:
    with st.expander("➕ Add an MCP server", expanded=False):
        st.caption(
            "Remote (SSE) servers are a URL, similar to an API connection. Local (stdio) servers are a command "
            "Missy spawns on this machine - only add one you trust, since its tools run with your own file/network "
            "access."
        )
        name = st.text_input("Name", key="new_mcp_name")
        transport = st.radio(
            "Transport", ["stdio (local)", "sse (remote)"], key="new_mcp_transport", horizontal=True
        )

        command, args_text, url = None, "", None
        if transport.startswith("stdio"):
            command = st.text_input("Command", placeholder="npx", key="new_mcp_command")
            args_text = st.text_input(
                "Arguments (space-separated)",
                placeholder="-y @modelcontextprotocol/server-filesystem /path/to/folder",
                key="new_mcp_args",
            )
        else:
            url = st.text_input("Server URL", placeholder="https://example.com/mcp", key="new_mcp_url")

        env_text = st.text_area(
            "Environment variables / headers (optional, one KEY=VALUE per line)",
            key="new_mcp_env",
            height=80,
        )

        if st.button("Save", key="new_mcp_save", use_container_width=True):
            if not name.strip():
                st.error("Give the server a name.")
                return
            if transport.startswith("stdio") and not command.strip():
                st.error("A local (stdio) server needs a command.")
                return
            if transport.startswith("sse") and not (url or "").strip():
                st.error("A remote (sse) server needs a URL.")
                return

            env = {}
            for line in env_text.splitlines():
                if "=" in line:
                    key, _, value = line.partition("=")
                    env[key.strip()] = value.strip()

            try:
                api_client.add_mcp_server(
                    token,
                    name=name.strip(),
                    transport="stdio" if transport.startswith("stdio") else "sse",
                    command=command.strip() if command else None,
                    args=args_text.split() if args_text else None,
                    url=url.strip() if url else None,
                    env=env or None,
                )
                st.success("✅ Server added.")
                st.rerun()
            except api_client.ApiError as exc:
                st.error(str(exc))


def _render_server_row(token: str, server: dict) -> None:
    with st.container(border=True):
        name_col, status_col = st.columns([5, 2])
        name_col.markdown(f"**🔌 {server['name']}**")
        detail = server["command"] if server["transport"] == "stdio" else server["url"]
        name_col.caption(f"{server['transport']} · {detail}")
        status_col.markdown("🟢 Enabled" if server["is_enabled"] else "⚪ Disabled")

        toggle_col, delete_col = st.columns(2)
        if server["is_enabled"]:
            if toggle_col.button("Disable", key=f"disable_{server['id']}", use_container_width=True):
                try:
                    api_client.set_mcp_server_enabled(token, server["id"], False)
                    st.rerun()
                except api_client.ApiError as exc:
                    st.error(str(exc))
        else:
            if toggle_col.button("Enable", key=f"enable_{server['id']}", use_container_width=True):
                try:
                    api_client.set_mcp_server_enabled(token, server["id"], True)
                    st.rerun()
                except api_client.ApiError as exc:
                    st.error(str(exc))

        if delete_col.button("Delete", key=f"delete_mcp_{server['id']}", use_container_width=True):
            st.session_state[f"confirm_delete_mcp_{server['id']}"] = True

        confirm_key = f"confirm_delete_mcp_{server['id']}"
        if st.session_state.get(confirm_key):
            st.warning(f"Permanently delete '{server['name']}'?")
            yes_col, no_col = st.columns(2)
            if yes_col.button("Yes, delete", key=f"confirm_yes_mcp_{server['id']}", use_container_width=True):
                try:
                    api_client.delete_mcp_server(token, server["id"])
                except api_client.ApiError as exc:
                    st.error(str(exc))
                else:
                    st.session_state[confirm_key] = False
                    st.rerun()
            if no_col.button("Cancel", key=f"confirm_no_mcp_{server['id']}", use_container_width=True):
                st.session_state[confirm_key] = False
                st.rerun()


def render() -> None:
    token = session.get_token()
    st.title("MCP Servers")
    st.caption(
        "Connect Missy to external tools via the Model Context Protocol - a connected server's tools are picked "
        "up automatically in Chat, alongside her built-in ones, no toggle needed."
    )

    _render_add_form(token)
    st.divider()

    try:
        servers = api_client.list_mcp_servers(token)
    except api_client.ApiError as exc:
        st.error(str(exc))
        return

    if not servers:
        st.info("No MCP servers connected yet - use \"Add an MCP server\" above.")
        return

    for server in servers:
        _render_server_row(token, server)

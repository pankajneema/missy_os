from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.core.encryption import decrypt_secret, mask_secret
from app.models.llm_credential import LLMProvider
from app.models.user import User
from app.schemas.provider import (
    ProviderResponse,
    ProviderSaveRequest,
    RevokeRequest,
    TestConnectionRequest,
    TestConnectionResponse,
)
from app.services import provider_service

router = APIRouter(prefix="/providers", tags=["providers"])


def _to_response(credential, masked_api_key: str) -> ProviderResponse:
    return ProviderResponse(
        id=credential.id,
        name=credential.name,
        provider=credential.provider,
        masked_api_key=masked_api_key,
        model_name=credential.model_name,
        is_active=credential.is_active,
        is_revoked=credential.is_revoked,
        updated_at=credential.updated_at,
    )


@router.get("", response_model=list[ProviderResponse])
def list_providers(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[ProviderResponse]:
    return [_to_response(c, masked) for c, masked in provider_service.list_providers(db, current_user.id)]


@router.post("", response_model=ProviderResponse)
def save_provider(
    payload: ProviderSaveRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProviderResponse:
    credential = provider_service.save_provider(
        db,
        user_id=current_user.id,
        provider=payload.provider,
        api_key=payload.api_key,
        model_name=payload.model_name,
        name=payload.name,
    )
    return _to_response(credential, mask_secret(payload.api_key))


@router.post("/test", response_model=TestConnectionResponse)
def test_connection(payload: TestConnectionRequest, current_user: User = Depends(get_current_user)) -> TestConnectionResponse:
    success, message = provider_service.test_connection(payload.provider, payload.api_key, payload.model_name)
    return TestConnectionResponse(success=success, message=message)


@router.post("/{provider}/revoke", response_model=ProviderResponse)
def set_revoked(
    provider: LLMProvider,
    payload: RevokeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProviderResponse:
    credential = provider_service.set_revoked(db, current_user.id, provider, payload.revoked)
    masked = mask_secret(decrypt_secret(credential.encrypted_api_key))
    return _to_response(credential, masked)


@router.delete("/{provider}", status_code=status.HTTP_204_NO_CONTENT)
def delete_provider(
    provider: LLMProvider,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    provider_service.delete_provider(db, current_user.id, provider)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

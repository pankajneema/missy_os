from fastapi import HTTPException

from app.ai import web


def test_is_public_url_rejects_loopback():
    assert web._is_public_url("http://127.0.0.1/") is False


def test_is_public_url_rejects_link_local_metadata_address():
    assert web._is_public_url("http://169.254.169.254/latest/meta-data/") is False


def test_is_public_url_rejects_non_http_scheme():
    assert web._is_public_url("file:///etc/passwd") is False


def test_is_public_url_rejects_a_hostname_with_no_dns_record(monkeypatch):
    import socket

    def _raise(*a, **k):
        raise socket.gaierror("not found")

    monkeypatch.setattr(web.socket, "getaddrinfo", _raise)
    assert web._is_public_url("http://this-does-not-resolve.invalid/") is False


def test_is_public_url_accepts_a_public_looking_address(monkeypatch):
    monkeypatch.setattr(web.socket, "getaddrinfo", lambda *a, **k: [(None, None, None, None, ("93.184.216.34", 0))])
    assert web._is_public_url("http://example.com/") is True


def test_fetch_page_rejects_a_private_url_without_making_a_request(monkeypatch):
    def _fail_if_called(*a, **k):
        raise AssertionError("requests.get should never be called for a rejected URL")

    monkeypatch.setattr(web.requests, "get", _fail_if_called)

    try:
        web.fetch_page("http://127.0.0.1:5439/")
        assert False, "expected HTTPException"
    except HTTPException as exc:
        assert exc.status_code == 400
        assert "private" in exc.detail.lower()


def test_fetch_page_rejects_a_redirect_to_a_private_address(monkeypatch):
    def _fake_getaddrinfo(host, *a, **k):
        # example.com resolves "publicly"; the redirect target is a literal
        # link-local address, which must be caught on the SECOND hop's
        # check, not just the first - that's the whole point of this test.
        ip = "169.254.169.254" if host == "169.254.169.254" else "93.184.216.34"
        return [(None, None, None, None, (ip, 0))]

    monkeypatch.setattr(web.socket, "getaddrinfo", _fake_getaddrinfo)

    class _RedirectResponse:
        is_redirect = True
        headers = {"Location": "http://169.254.169.254/latest/meta-data/"}

    monkeypatch.setattr(web.requests, "get", lambda *a, **k: _RedirectResponse())

    try:
        web.fetch_page("http://example.com/")
        assert False, "expected HTTPException"
    except HTTPException as exc:
        assert exc.status_code == 400
        assert "private" in exc.detail.lower()

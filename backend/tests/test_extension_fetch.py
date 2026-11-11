import socket

import pytest

from app.services import extensions

PUBLIC = "93.184.216.34"
HOST = "media.example.test"


class Refused(OSError):
    pass


def resolver(monkeypatch, *answers):
    calls = []

    def fake(host, port, *args, **kwargs):
        calls.append(host)
        addrs = answers[min(len(calls), len(answers)) - 1]
        out = []
        for a in addrs:
            family = socket.AF_INET6 if ":" in a else socket.AF_INET
            sockaddr = (a, port, 0, 0) if family == socket.AF_INET6 else (a, port)
            out.append((family, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", sockaddr))
        return out

    monkeypatch.setattr(socket, "getaddrinfo", fake)
    return calls


def dialer(monkeypatch):
    dialled = []

    def fake(address, *args, **kwargs):
        dialled.append(address)
        raise Refused("test stops here")

    monkeypatch.setattr(socket, "create_connection", fake)
    return dialled


def test_fetch_connects_to_the_address_it_checked_not_a_second_lookup(monkeypatch):
    resolver(monkeypatch, [PUBLIC], ["127.0.0.1"])
    dialled = dialer(monkeypatch)
    with pytest.raises(ValueError, match="the request failed"):
        extensions.fetch(f"https://{HOST}/clip.json")
    assert dialled and dialled[0][0] == PUBLIC
    assert all(d[0] == PUBLIC for d in dialled)


def test_fetch_ignores_environment_proxies(monkeypatch):
    for key in ("HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy"):
        monkeypatch.setenv(key, "http://127.0.0.1:7711")
    for key in ("NO_PROXY", "no_proxy"):
        monkeypatch.delenv(key, raising=False)
    resolver(monkeypatch, [PUBLIC])
    dialled = dialer(monkeypatch)
    with pytest.raises(ValueError, match="the request failed"):
        extensions.fetch(f"https://{HOST}/clip.json")
    assert dialled and dialled[0][0] == PUBLIC


@pytest.mark.parametrize("bad", [
    "127.0.0.1", "10.1.2.3", "172.16.0.9", "192.168.1.10", "169.254.169.254", "100.64.0.1", "100.127.255.254",
    "0.0.0.0", "224.0.0.1", "240.0.0.1", "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1",
    "::ffff:100.64.0.1", "64:ff9b::a00:1", "2002:a00:1::1", "::",
])
def test_fetch_refuses_when_any_address_is_not_public(monkeypatch, bad):
    resolver(monkeypatch, [PUBLIC, bad])
    dialled = dialer(monkeypatch)
    with pytest.raises(PermissionError):
        extensions.fetch(f"https://{HOST}/clip.json")
    assert dialled == []


def test_fetch_sends_the_host_name_for_sni_and_the_host_header(monkeypatch):
    resolver(monkeypatch, [PUBLIC])
    seen = {}

    class Sock:
        def setsockopt(self, *args):
            pass

        def close(self):
            pass

    def fake_dial(address, *args, **kwargs):
        seen["address"] = address
        return Sock()

    def fake_wrap(self, sock, server_hostname=None, **kwargs):
        seen["sni"] = server_hostname
        raise Refused("test stops here")

    monkeypatch.setattr(socket, "create_connection", fake_dial)
    monkeypatch.setattr("ssl.SSLContext.wrap_socket", fake_wrap)
    with pytest.raises(ValueError, match="the request failed"):
        extensions.fetch(f"https://{HOST}:8443/clip.json")
    assert seen == {"address": (PUBLIC, 8443), "sni": HOST}


def test_fetch_keeps_its_other_rules(monkeypatch):
    resolver(monkeypatch, [PUBLIC])
    dialer(monkeypatch)
    with pytest.raises(ValueError, match="only https"):
        extensions.fetch(f"http://{HOST}/")
    with pytest.raises(ValueError, match="not allowed"):
        extensions.fetch(f"https://{HOST}/", method="TRACE")


PUBLIC6 = "2606:2800:220:1:248:1893:25c8:1946"


class Sock:
    def setsockopt(self, *args):
        pass

    def close(self):
        pass


def test_fetch_tries_each_checked_address_in_order_when_ipv6_does_not_connect(monkeypatch):
    calls = resolver(monkeypatch, [PUBLIC6, PUBLIC], ["127.0.0.1"])
    seen = {"dialled": []}

    def fake_dial(address, *args, **kwargs):
        seen["dialled"].append(address)
        if ":" in address[0]:
            raise Refused("no IPv6 route")
        return Sock()

    def fake_wrap(self, sock, server_hostname=None, **kwargs):
        seen["sni"] = server_hostname
        raise Refused("test stops here")

    monkeypatch.setattr(socket, "create_connection", fake_dial)
    monkeypatch.setattr("ssl.SSLContext.wrap_socket", fake_wrap)
    with pytest.raises(ValueError, match="test stops here"):
        extensions.fetch(f"https://{HOST}/clip.json")
    assert seen == {"dialled": [(PUBLIC6, 443), (PUBLIC, 443)], "sni": HOST}
    assert calls == [HOST]


def test_fetch_reports_the_last_error_when_no_checked_address_connects(monkeypatch):
    resolver(monkeypatch, [PUBLIC6, PUBLIC])
    dialled = []

    def fake_dial(address, *args, **kwargs):
        dialled.append(address)
        raise Refused(f"cannot reach {address[0]}")

    monkeypatch.setattr(socket, "create_connection", fake_dial)
    with pytest.raises(ValueError, match=f"cannot reach {PUBLIC}"):
        extensions.fetch(f"https://{HOST}/clip.json")
    assert dialled == [(PUBLIC6, 443), (PUBLIC, 443)]


def test_fetch_refuses_a_mix_when_a_later_address_is_not_public(monkeypatch):
    resolver(monkeypatch, [PUBLIC6, PUBLIC, "10.0.0.1"])
    dialled = dialer(monkeypatch)
    with pytest.raises(PermissionError):
        extensions.fetch(f"https://{HOST}/clip.json")
    assert dialled == []

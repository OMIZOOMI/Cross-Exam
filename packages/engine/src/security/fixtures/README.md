# TLS test fixture

This certificate and private key are public, disposable test data, never production credentials. The certificate names `example.com`; tests trust it only inside a test-only TLS routing shim to an ephemeral loopback server created by that test. Tests never connect to example.com or any existing service.

Regenerate together when needed:

```sh
openssl req -x509 -newkey rsa:2048 -nodes -keyout test-key.pem -out test-cert.pem -days 3650 -subj '/CN=example.com/O=CrossExam TEST FIXTURE' -addext 'subjectAltName=DNS:example.com'
```

The production transport offers no CA/dialer/private-address override. The successful fixture test substitutes the socket's peer fields to simulate a public connection; negative tests separately exercise real peer rejection, untrusted TLS, and a hostname mismatch. In-memory transport tests cover the HTTP parser without network I/O.

Reviewed 2026-10-01: the certificate self-signature and key match were verified; subject and issuer both identify `CrossExam TEST FIXTURE`. Repository code references are confined to the controlled TLS integration test. Safe for public version control as disposable test data, not a real service credential. Never reuse this key or install this certificate into a system/production trust store. Git history was empty at the initial review, so this conclusion rests on the current certificate and source/configuration inspection, not historical provenance.

# Product

CrossExam is an adversarial website intelligence and verification tool for web developers, small teams, and technical reviewers who need findings they can inspect and reproduce.

## Problem and principle

Website audit tools can produce opaque scores; AI reviews can turn plausible guesses into facts. CrossExam collects deterministic evidence, makes narrow claims, challenges them, and preserves uncertainty. An AI assertion is not evidence merely because a model produced it.

## V1 journey

1. Enter a public HTTP(S) website URL.
2. Inspect a bounded public surface after enforcing the URL/egress security policy.
3. Map routes and resources, collect technical observations, and retain their context.
4. Turn observations into structured claims. Let Explorer, Breaker, Skeptic, Reproducer, and Judge challenge them.
5. Review evidence-backed findings, unresolved questions, and proposed changes with verification steps.

Deterministic scanning must remain useful without an AI key. The web experience should be a polished investigation console, with clear provenance rather than a single unexplained health score.

## V1 scope

Bounded route discovery; navigation/network failures; console errors; lab performance; accessibility observations; metadata; passive HTTP/HTTPS/header/cookie observations. Safe reproduction only. Distinguish OBSERVED, DERIVED, INFERRED, and SIMULATED; always retain source and evidence links.

## Current deliverable

A local, bounded deterministic HTTP/HTML investigation is available from the URL form. It collects real document responses, metadata, structure, resource declarations and headers, then derives narrow evidence-backed findings. `/report/<id>` displays LIVE INVESTIGATION data; `/report/demo` remains a separate synthetic example. No target browser execution or AI provider runs. The fictional `acme.example` domain is never contacted.

## Non-goals

No exploit automation, credential attacks, intrusive testing, authenticated crawling, writes to external sites, production deployment, billing, authentication, database architecture, or WhatIf implementation. No need for a distributed platform during week one. Do not imply that passive observations certify site security or accessibility compliance.

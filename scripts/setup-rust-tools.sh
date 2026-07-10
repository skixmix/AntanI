#!/bin/sh
# Installs local dev-only Rust tooling that isn't part of the stable toolchain.
# Idempotent and fast on repeat runs; skipped entirely if cargo isn't on PATH
# yet (first-time contributors installing Rust after `bun install`).
set -e

[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"

command -v cargo >/dev/null 2>&1 || exit 0

if ! command -v cargo-llvm-cov >/dev/null 2>&1; then
  echo "▶ installing cargo-llvm-cov (used by CI's coverage gate; see AGENTS.md)"
  cargo install cargo-llvm-cov --locked
fi

rustup component add llvm-tools-preview >/dev/null 2>&1 || true

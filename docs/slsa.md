# Tundra Release Provenance (SLSA Level 3)

Every Tundra release from v1.0.0 onward includes SLSA Level 3 provenance.

## What this means

- Builds run in isolated GitHub Actions ephemeral environments
- Build provenance is signed by Sigstore/Cosign (no long-lived signing key required)
- The SLSA verifier can confirm: which source commit produced which binary

## Verifying a release

```bash
# Install the SLSA verifier
go install github.com/slsa-framework/slsa-verifier/v2/cli/slsa-verifier@latest

# Download the artefact and its provenance
curl -Lo tundrad.tar.zst https://github.com/mralaminahamed/tundra/releases/download/v1.0.0/tundrad-1.0.0-linux-x86_64.tar.zst
curl -Lo provenance.intoto.jsonl https://github.com/mralaminahamed/tundra/releases/download/v1.0.0/multiple.intoto.jsonl

# Verify
slsa-verifier verify-artifact tundrad.tar.zst \
  --provenance-path provenance.intoto.jsonl \
  --source-uri github.com/mralaminahamed/tundra \
  --source-tag v1.0.0
```

## Minisign verification

Each artefact is also signed with minisign. The public key is embedded in `installer/install.sh`:

```
RWTg/+jJF1KMagVo4qwxcMMWWJgRb5LBkBPAX/BoMsS+cM2qpNbKJJqF
```

```bash
minisign -V \
  -p <(echo 'RWTg/+jJF1KMagVo4qwxcMMWWJgRb5LBkBPAX/BoMsS+cM2qpNbKJJqF') \
  -m tundrad-1.0.0-linux-x86_64.tar.zst \
  -x tundrad-1.0.0-linux-x86_64.tar.zst.minisig
```

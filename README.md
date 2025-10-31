
# termux-code v1.0.0 (patched)

Termux-Code — lightweight, VS Code–like IDE optimized for Termux.
Developer: Paong & Evelyn
Version: 1.0.0

This patched build includes:
- GitHub OAuth login flow (server-side, saves token in LowDB)
- Git clone / push endpoints using stored token
- Plugin install endpoint (clone plugin repo server-side)
- Lightweight frontend with Git login button and Git actions

## Quick install (Termux)
```bash
pkg update -y && pkg upgrade -y
pkg install git nodejs python curl wget -y
git clone https://github.com/PaongEvelyn/termux-code.git
cd termux-code
chmod +x install.sh
./install.sh
```
Before OAuth: set your GitHub OAuth App credentials in environment or edit .env:
```
export GITHUB_CLIENT_ID=your_client_id
export GITHUB_CLIENT_SECRET=your_client_secret
```
Redirect URI recommended: http://localhost:4000/auth/github/callback

Open in browser: http://localhost:4000

## GitHub Flow
- Click "Login with GitHub" in UI -> popup -> authorize -> server stores token.
- Use Git actions (Clone/Push) from UI; server performs git ops using stored token.

## Security
Tokens are stored in `~/.termux-code/db.json`. Keep device secure.


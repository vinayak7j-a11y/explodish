# Putting Explodish on the internet

**Status of this guide: written carefully but NOT yet run on a real server.** Do it once for a test server first,
and fix anything that differs. Prices and screens change, so check each provider's own page.

## 0. What you need
- A small Linux server (VPS) with **Ubuntu 24.04**, 1 GB RAM is enough for a few restaurants. In India, plans started around
  US$4 to 6 a month (about ₹350 to ₹500) at DigitalOcean Bangalore and from about ₹600 a month at Hostinger or Vultr in Mumbai
  when this was written (Nov 2026). Some bill only in US dollars by card; others take UPI. Check before paying.
- A **domain name** (usually a few hundred rupees a year). HTTPS needs one, and phones only allow lock-screen
  notifications on HTTPS. For a one-day demo with no domain, see "Quick demo" at the end.
- Your GitHub repo: https://github.com/vinayak7j-a11y/explodish

## 1. Point the domain at the server
At your domain registrar add an **A record**: `menu` (or `@`) -> the server's IP address. Wait a few minutes.

## 2. Set up the server (one time)
Log in from your Mac Terminal: `ssh root@SERVER_IP`, then run:

```
adduser --system --group --home /opt/explodish explodish
apt update && apt install -y git curl ufw
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

Get the app:

```
git clone https://github.com/vinayak7j-a11y/explodish.git /opt/explodish-src
cp -a /opt/explodish-src/. /opt/explodish/
rm -rf /opt/explodish-src
cd /opt/explodish
npm install --omit=dev
mkdir -p data backups
cp .env.example .env
nano .env
```

In `.env` fill in at least `JWT_SECRET` (make one with
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`), `PUBLIC_URL` (https://menu.yourdomain.com)
and `PUSH_CONTACT`. Leave `NODE_ENV=production` and `TRUST_PROXY=1`. Then:

```
chown -R explodish:explodish /opt/explodish
chmod 600 /opt/explodish/.env
cp deploy/explodish.service /etc/systemd/system/explodish.service
systemctl daemon-reload
systemctl enable --now explodish
systemctl status explodish
```

It should say **active (running)**. Logs: `journalctl -u explodish -f`.

## 3. HTTPS with Caddy
Install Caddy by the steps on https://caddyserver.com/docs/install (the Ubuntu/Debian section), then:

```
cp /opt/explodish/deploy/Caddyfile /etc/caddy/Caddyfile
nano /etc/caddy/Caddyfile
systemctl reload caddy
```

Put your real domain in place of `menu.yourdomain.com`. Open https://menu.yourdomain.com/healthz. You should see `{"ok":true}`.

## 4. First check
1. Open https://menu.yourdomain.com/admin and register the first restaurant.
2. Add a few dishes, press **Send a test order** in the Kitchen tab.
3. Turn on lock-screen notifications on your phone (Kitchen tab) and send a test notification.
4. Make the table QR codes from the public address and scan one with another phone.

## 5. Backups (do not skip)
Automatic: with `BACKUP_DIR` set, the app makes a checked copy every 24 hours and keeps the last 14.
Make one by hand any time: `cd /opt/explodish && sudo -u explodish node --env-file=.env backup.js`.

Copies on the same server are not enough if the server is lost. Once a week copy them to your Mac:

```
scp -r root@SERVER_IP:/opt/explodish/backups ~/explodish-backups
```

**Test a restore once** before you rely on it:

```
systemctl stop explodish
cd /opt/explodish
sudo -u explodish node --env-file=.env restore.js backups/<pick-a-file>.db
systemctl start explodish
```

## 6. Updating the app later
```
cd /opt/explodish
sudo -u explodish git pull        # if this says "not a git repository", re-clone as in step 2
sudo -u explodish npm install --omit=dev
systemctl restart explodish
```

## 7. Quick demo with no server and no domain (one day only)
On your Mac, with the app running on port 3000, install Cloudflare's free `cloudflared` tool and run
`cloudflared tunnel --url http://localhost:3000`. It prints a temporary https address. Open admin through it
(so QR codes use it) or set `PUBLIC_URL`, and set `TRUST_PROXY=1`. The address changes every time and your Mac must stay on and awake.
Fine for showing one restaurant, not for real use.

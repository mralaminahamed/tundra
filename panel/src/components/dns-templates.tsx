import { useState, type ReactNode } from 'react'
import { GlobeIcon, MailIcon, RocketIcon, LockIcon, WrenchIcon, WarningIcon } from '@/components/icons'

export interface TplRecord {
  name: string
  record_type: string
  content: string
  ttl: number
  priority?: number
}

export interface DnsTemplate {
  id: string
  name: string
  category: 'web' | 'email' | 'deploy' | 'security' | 'utility'
  description: string
  color: string
  note?: string
  records: TplRecord[]
}

export const RECORD_TYPE_CLS: Record<string, string> = {
  A:     'border-blue-200 bg-blue-50 text-blue-700',
  AAAA:  'border-indigo-200 bg-indigo-50 text-indigo-700',
  CNAME: 'border-purple-200 bg-purple-50 text-purple-700',
  MX:    'border-orange-200 bg-orange-50 text-orange-700',
  TXT:   'border-gray-200 bg-gray-50 text-gray-600',
  NS:    'border-teal-200 bg-teal-50 text-teal-700',
  SRV:   'border-pink-200 bg-pink-50 text-pink-700',
  CAA:   'border-red-200 bg-red-50 text-red-600',
}

export const DNS_TEMPLATES: DnsTemplate[] = [
  // ── WEB ───────────────────────────────────────────────────────────────────
  {
    id: 'plesk-default',
    name: 'Full Hosting Stack',
    category: 'web',
    description: 'Plesk-style default: A + www + mail + webmail + ftp + MX + SPF. Everything a shared hosting domain needs.',
    color: 'green',
    records: [
      { name: '@',       record_type: 'A',     content: '{IP}',              ttl: 3600 },
      { name: 'www',     record_type: 'A',     content: '{IP}',              ttl: 3600 },
      { name: 'mail',    record_type: 'A',     content: '{IP}',              ttl: 3600 },
      { name: 'webmail', record_type: 'A',     content: '{IP}',              ttl: 3600 },
      { name: 'ftp',     record_type: 'CNAME', content: '{DOMAIN}',          ttl: 3600 },
      { name: '@',       record_type: 'MX',    content: 'mail.{DOMAIN}',     ttl: 3600, priority: 10 },
      { name: '@',       record_type: 'TXT',   content: 'v=spf1 +a +mx ~all', ttl: 3600 },
    ],
  },
  {
    id: 'basic-web',
    name: 'Basic Web',
    category: 'web',
    description: 'A record + www CNAME. Minimum for any website.',
    color: 'blue',
    records: [
      { name: '@',   record_type: 'A',     content: '{IP}', ttl: 3600 },
      { name: 'www', record_type: 'CNAME', content: '@',    ttl: 3600 },
    ],
  },
  {
    id: 'dual-stack',
    name: 'Dual Stack (IPv4 + IPv6)',
    category: 'web',
    description: 'A + AAAA + www for full IPv4/IPv6 support.',
    color: 'blue',
    note: "Edit the AAAA record after import to set your server's IPv6 address.",
    records: [
      { name: '@',   record_type: 'A',     content: '{IP}',              ttl: 3600 },
      { name: '@',   record_type: 'AAAA',  content: 'YOUR_IPV6_ADDRESS', ttl: 3600 },
      { name: 'www', record_type: 'CNAME', content: '@',                 ttl: 3600 },
    ],
  },
  {
    id: 'wordpress',
    name: 'WordPress',
    category: 'web',
    description: 'A + www + SPF + DMARC quarantine. Complete setup for WordPress.',
    color: 'indigo',
    records: [
      { name: '@',      record_type: 'A',     content: '{IP}',                                                        ttl: 3600 },
      { name: 'www',    record_type: 'CNAME', content: '@',                                                           ttl: 3600 },
      { name: '@',      record_type: 'TXT',   content: 'v=spf1 a mx ~all',                                            ttl: 3600 },
      { name: '_dmarc', record_type: 'TXT',   content: 'v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@{DOMAIN}', ttl: 3600 },
    ],
  },

  // ── EMAIL ─────────────────────────────────────────────────────────────────
  {
    id: 'self-hosted-mail',
    name: 'Self-hosted Mail',
    category: 'email',
    description: 'MX → mail.{DOMAIN} + SPF (ip4 + mx) + DMARC for Postfix/Dovecot.',
    color: 'green',
    records: [
      { name: '@',      record_type: 'A',     content: '{IP}',                                                                    ttl: 3600 },
      { name: 'www',    record_type: 'CNAME', content: '@',                                                                       ttl: 3600 },
      { name: 'mail',   record_type: 'A',     content: '{IP}',                                                                    ttl: 3600 },
      { name: '@',      record_type: 'MX',    content: 'mail.{DOMAIN}',                                                           ttl: 3600, priority: 10 },
      { name: '@',      record_type: 'TXT',   content: 'v=spf1 a mx ip4:{IP} ~all',                                               ttl: 3600 },
      { name: '_dmarc', record_type: 'TXT',   content: 'v=DMARC1; p=none; rua=mailto:dmarc@{DOMAIN}; ruf=mailto:dmarc@{DOMAIN}', ttl: 3600 },
    ],
  },
  {
    id: 'google-workspace',
    name: 'Google Workspace',
    category: 'email',
    description: '5 priority-tiered MX + SPF + DMARC for Gmail / Google Workspace.',
    color: 'red',
    note: 'Add your DKIM TXT record from Google Admin Console → Apps → Google Workspace → Gmail → Authenticate email.',
    records: [
      { name: '@',      record_type: 'MX',  content: 'aspmx.l.google.com',                          ttl: 3600, priority: 1  },
      { name: '@',      record_type: 'MX',  content: 'alt1.aspmx.l.google.com',                     ttl: 3600, priority: 5  },
      { name: '@',      record_type: 'MX',  content: 'alt2.aspmx.l.google.com',                     ttl: 3600, priority: 5  },
      { name: '@',      record_type: 'MX',  content: 'alt3.aspmx.l.google.com',                     ttl: 3600, priority: 10 },
      { name: '@',      record_type: 'MX',  content: 'alt4.aspmx.l.google.com',                     ttl: 3600, priority: 10 },
      { name: '@',      record_type: 'TXT', content: 'v=spf1 include:_spf.google.com ~all',          ttl: 3600 },
      { name: '_dmarc', record_type: 'TXT', content: 'v=DMARC1; p=none; rua=mailto:dmarc@{DOMAIN}', ttl: 3600 },
    ],
  },
  {
    id: 'microsoft-365',
    name: 'Microsoft 365',
    category: 'email',
    description: 'MX + SPF + autodiscover CNAME + DMARC for Microsoft 365 / Outlook.',
    color: 'orange',
    note: 'Add DKIM CNAME pairs (selector1/selector2._domainkey) from Microsoft 365 Admin Center → Settings → Domains.',
    records: [
      { name: '@',            record_type: 'MX',    content: '{DOMAIN}.mail.protection.outlook.com',           ttl: 3600, priority: 0 },
      { name: '@',            record_type: 'TXT',   content: 'v=spf1 include:spf.protection.outlook.com ~all', ttl: 3600 },
      { name: 'autodiscover', record_type: 'CNAME', content: 'autodiscover.outlook.com',                       ttl: 3600 },
      { name: '_dmarc',       record_type: 'TXT',   content: 'v=DMARC1; p=none; rua=mailto:dmarc@{DOMAIN}',   ttl: 3600 },
    ],
  },
  {
    id: 'zoho-mail',
    name: 'Zoho Mail',
    category: 'email',
    description: '3 MX records + SPF + DMARC for Zoho Mail.',
    color: 'purple',
    note: 'Add DKIM TXT from Zoho Admin Console → Domains → Email Authentication.',
    records: [
      { name: '@',      record_type: 'MX',  content: 'mx.zoho.com',                                   ttl: 3600, priority: 10 },
      { name: '@',      record_type: 'MX',  content: 'mx2.zoho.com',                                  ttl: 3600, priority: 20 },
      { name: '@',      record_type: 'MX',  content: 'mx3.zoho.com',                                  ttl: 3600, priority: 50 },
      { name: '@',      record_type: 'TXT', content: 'v=spf1 include:zohomail.com ~all',               ttl: 3600 },
      { name: '_dmarc', record_type: 'TXT', content: 'v=DMARC1; p=none; rua=mailto:dmarc@{DOMAIN}',   ttl: 3600 },
    ],
  },
  {
    id: 'mailgun',
    name: 'Mailgun',
    category: 'email',
    description: '2 MX + SPF + tracking CNAME + DMARC for Mailgun transactional email.',
    color: 'teal',
    note: 'Add DKIM TXT records from Mailgun Dashboard → Sending → Domains → your domain.',
    records: [
      { name: '@',      record_type: 'MX',    content: 'mxa.mailgun.org',                              ttl: 3600, priority: 10 },
      { name: '@',      record_type: 'MX',    content: 'mxb.mailgun.org',                              ttl: 3600, priority: 10 },
      { name: '@',      record_type: 'TXT',   content: 'v=spf1 include:mailgun.org ~all',              ttl: 3600 },
      { name: 'email',  record_type: 'CNAME', content: 'mailgun.org',                                  ttl: 3600 },
      { name: '_dmarc', record_type: 'TXT',   content: 'v=DMARC1; p=none; rua=mailto:dmarc@{DOMAIN}', ttl: 3600 },
    ],
  },
  {
    id: 'sendgrid',
    name: 'SendGrid',
    category: 'email',
    description: 'SPF + DMARC baseline for SendGrid. DKIM CNAMEs are account-specific.',
    color: 'teal',
    note: 'Add 3 account-specific DKIM CNAME records from SendGrid → Settings → Sender Authentication.',
    records: [
      { name: '@',      record_type: 'TXT', content: 'v=spf1 include:sendgrid.net ~all',             ttl: 3600 },
      { name: '_dmarc', record_type: 'TXT', content: 'v=DMARC1; p=none; rua=mailto:dmarc@{DOMAIN}', ttl: 3600 },
    ],
  },
  {
    id: 'amazon-ses',
    name: 'Amazon SES',
    category: 'email',
    description: 'SPF + DMARC for Amazon SES. DKIM CNAME records come from AWS Console.',
    color: 'orange',
    note: 'Add 3 DKIM CNAME records from AWS Console → SES → Verified identities → your domain → DKIM.',
    records: [
      { name: '@',      record_type: 'TXT', content: 'v=spf1 include:amazonses.com ~all',            ttl: 3600 },
      { name: '_dmarc', record_type: 'TXT', content: 'v=DMARC1; p=none; rua=mailto:dmarc@{DOMAIN}', ttl: 3600 },
    ],
  },

  // ── DEPLOY ────────────────────────────────────────────────────────────────
  {
    id: 'github-pages',
    name: 'GitHub Pages',
    category: 'deploy',
    description: '4 A records pointing to GitHub Pages IPs + www CNAME.',
    color: 'gray',
    records: [
      { name: '@',   record_type: 'A',     content: '185.199.108.153', ttl: 3600 },
      { name: '@',   record_type: 'A',     content: '185.199.109.153', ttl: 3600 },
      { name: '@',   record_type: 'A',     content: '185.199.110.153', ttl: 3600 },
      { name: '@',   record_type: 'A',     content: '185.199.111.153', ttl: 3600 },
      { name: 'www', record_type: 'CNAME', content: '{DOMAIN}',        ttl: 3600 },
    ],
  },
  {
    id: 'vercel',
    name: 'Vercel',
    category: 'deploy',
    description: 'A @ (76.76.21.21) + www CNAME for Vercel deployments.',
    color: 'gray',
    records: [
      { name: '@',   record_type: 'A',     content: '76.76.21.21',          ttl: 3600 },
      { name: 'www', record_type: 'CNAME', content: 'cname.vercel-dns.com', ttl: 3600 },
    ],
  },
  {
    id: 'netlify',
    name: 'Netlify',
    category: 'deploy',
    description: 'www CNAME to your Netlify site. Update the placeholder after import.',
    color: 'teal',
    note: "Apex (root @) domain requires an ALIAS or ANAME record — not all DNS providers support this. Check your provider's docs, or use Netlify DNS.",
    records: [
      { name: 'www', record_type: 'CNAME', content: 'YOUR-SITE.netlify.app', ttl: 3600 },
    ],
  },

  // ── SECURITY ──────────────────────────────────────────────────────────────
  {
    id: 'caa-letsencrypt',
    name: "CAA — Let's Encrypt",
    category: 'security',
    description: "Restricts TLS certificate issuance to Let's Encrypt only.",
    color: 'yellow',
    records: [
      { name: '@', record_type: 'CAA', content: '0 issue "letsencrypt.org"',           ttl: 3600 },
      { name: '@', record_type: 'CAA', content: '0 issuewild "letsencrypt.org"',       ttl: 3600 },
      { name: '@', record_type: 'CAA', content: '0 iodef "mailto:security@{DOMAIN}"', ttl: 3600 },
    ],
  },
  {
    id: 'caa-zerossl',
    name: 'CAA — ZeroSSL',
    category: 'security',
    description: 'Restricts TLS certificate issuance to ZeroSSL (sectigo.com).',
    color: 'yellow',
    records: [
      { name: '@', record_type: 'CAA', content: '0 issue "sectigo.com"',              ttl: 3600 },
      { name: '@', record_type: 'CAA', content: '0 issuewild "sectigo.com"',          ttl: 3600 },
      { name: '@', record_type: 'CAA', content: '0 iodef "mailto:security@{DOMAIN}"', ttl: 3600 },
    ],
  },
  {
    id: 'mta-sts',
    name: 'MTA-STS + TLS-RPT',
    category: 'security',
    description: 'Enforces encrypted SMTP delivery and enables TLS failure reporting.',
    color: 'purple',
    note: 'MTA-STS also requires a policy file served over HTTPS at https://mta-sts.{DOMAIN}/.well-known/mta-sts.txt with content: version, mode, max_age, and mx fields.',
    records: [
      { name: '_mta-sts',   record_type: 'TXT', content: 'v=STSv1; id=20240101T000000Z',          ttl: 3600 },
      { name: '_smtp._tls', record_type: 'TXT', content: 'v=TLSRPTv1; rua=mailto:tls@{DOMAIN}',  ttl: 3600 },
    ],
  },
  {
    id: 'dmarc-enforce',
    name: 'DMARC Enforce (p=reject)',
    category: 'security',
    description: 'Full DMARC enforcement with aggregate + forensic reporting. Hard-rejects unauthenticated mail.',
    color: 'red',
    note: 'Do NOT start at p=reject. Ramp up: p=none → p=quarantine → p=reject. As of 2025, Gmail and Microsoft 365 permanently reject mail from domains with broken DMARC.',
    records: [
      { name: '_dmarc', record_type: 'TXT', content: 'v=DMARC1; p=reject; rua=mailto:dmarc-agg@{DOMAIN}; ruf=mailto:dmarc-fail@{DOMAIN}; adkim=s; aspf=s; pct=100', ttl: 3600 },
    ],
  },
  {
    id: 'parked-domain',
    name: 'Parked Domain (No Email)',
    category: 'security',
    description: 'SPF -all + null MX (RFC 7505) + DMARC p=reject. Blocks all email spoofing from inactive domains.',
    color: 'gray',
    records: [
      { name: '@',      record_type: 'TXT', content: 'v=spf1 -all',    ttl: 3600 },
      { name: '@',      record_type: 'MX',  content: '.',               ttl: 3600, priority: 0 },
      { name: '_dmarc', record_type: 'TXT', content: 'v=DMARC1; p=reject;', ttl: 3600 },
    ],
  },

  // ── EMAIL — More providers ─────────────────────────────────────────────────
  {
    id: 'cloudflare-email',
    name: 'Cloudflare Email Routing',
    category: 'email',
    description: '3 MX records + SPF for routing email through Cloudflare Email Routing.',
    color: 'orange',
    note: 'Enable Email Routing in the Cloudflare dashboard first — it adds these automatically. Add manually only if missing.',
    records: [
      { name: '@', record_type: 'MX',  content: 'route1.mx.cloudflare.net',          ttl: 3600, priority: 2  },
      { name: '@', record_type: 'MX',  content: 'route2.mx.cloudflare.net',          ttl: 3600, priority: 19 },
      { name: '@', record_type: 'MX',  content: 'route3.mx.cloudflare.net',          ttl: 3600, priority: 75 },
      { name: '@', record_type: 'TXT', content: 'v=spf1 include:_spf.mx.cloudflare.net ~all', ttl: 3600 },
    ],
  },
  {
    id: 'protonmail',
    name: 'ProtonMail',
    category: 'email',
    description: '2 MX records + SPF + DMARC for ProtonMail custom domain email.',
    color: 'purple',
    note: 'Add 3 DKIM CNAME records from Proton Settings → Custom Domains → DKIM tab. Format: protonmail._domainkey → protonmail.domainkey.<hash>.domains.proton.ch',
    records: [
      { name: '@',      record_type: 'MX',  content: 'mail.protonmail.ch',                       ttl: 3600, priority: 10 },
      { name: '@',      record_type: 'MX',  content: 'mailsec.protonmail.ch',                    ttl: 3600, priority: 20 },
      { name: '@',      record_type: 'TXT', content: 'v=spf1 include:_spf.protonmail.ch mx ~all', ttl: 3600 },
      { name: '_dmarc', record_type: 'TXT', content: 'v=DMARC1; p=none; rua=mailto:dmarc@{DOMAIN}', ttl: 3600 },
    ],
  },
  {
    id: 'fastmail',
    name: 'Fastmail',
    category: 'email',
    description: '2 MX records + SPF (-all) for Fastmail custom domain email.',
    color: 'teal',
    note: 'Add 3 DKIM CNAMEs from Fastmail Settings → Domains. Format: fm1._domainkey → fm1.{DOMAIN}.dkim.fmhosted.com (repeat for fm2, fm3). Do NOT proxy these through Cloudflare.',
    records: [
      { name: '@',      record_type: 'MX',  content: 'in1-smtp.messagingengine.com',              ttl: 3600, priority: 10 },
      { name: '@',      record_type: 'MX',  content: 'in2-smtp.messagingengine.com',              ttl: 3600, priority: 20 },
      { name: '@',      record_type: 'TXT', content: 'v=spf1 include:spf.messagingengine.com -all', ttl: 3600 },
      { name: '_dmarc', record_type: 'TXT', content: 'v=DMARC1; p=none; rua=mailto:dmarc@{DOMAIN}', ttl: 3600 },
    ],
  },
  {
    id: 'resend',
    name: 'Resend',
    category: 'email',
    description: 'DKIM CNAME + SPF for Resend transactional email.',
    color: 'gray',
    note: 'Copy exact record values from Resend dashboard → Domains. The DKIM selector is typically "resend" but may vary by region.',
    records: [
      { name: 'resend._domainkey', record_type: 'CNAME', content: 'resend._domainkey.resend.com',              ttl: 3600 },
      { name: '@',                 record_type: 'TXT',   content: 'v=spf1 include:_spf.resend.com -all',       ttl: 3600 },
      { name: '_dmarc',            record_type: 'TXT',   content: 'v=DMARC1; p=none; rua=mailto:dmarc@{DOMAIN}', ttl: 3600 },
    ],
  },
  {
    id: 'postmark',
    name: 'Postmark',
    category: 'email',
    description: 'SPF + Return-Path CNAME for Postmark transactional email. Enables full DMARC alignment.',
    color: 'yellow',
    note: 'Add account-specific DKIM TXT record from Postmark → Sender Signatures. Selector format: YYYYMMDDHHMMSSpm._domainkey.',
    records: [
      { name: '@',           record_type: 'TXT',   content: 'v=spf1 include:spf.mtasv.net ~all',            ttl: 3600 },
      { name: 'pm-bounces',  record_type: 'CNAME', content: 'pm.mtasv.net',                                  ttl: 3600 },
      { name: '_dmarc',      record_type: 'TXT',   content: 'v=DMARC1; p=none; rua=mailto:dmarc@{DOMAIN}',  ttl: 3600 },
    ],
  },
  {
    id: 'bimi',
    name: 'BIMI (Email Logo)',
    category: 'email',
    description: 'Brand Indicators for Message Identification — shows your logo next to emails in Gmail and Apple Mail.',
    color: 'indigo',
    note: 'Prerequisites: DMARC p=reject or p=quarantine with pct=100. Logo must be SVG Tiny 1.2 P/S, ≤32 KB, square. Gmail requires a VMC or CMC certificate from DigiCert/Entrust.',
    records: [
      { name: 'default._bimi', record_type: 'TXT', content: 'v=BIMI1; l=https://{DOMAIN}/logo.svg; a=https://{DOMAIN}/bimi-cert.pem;', ttl: 3600 },
    ],
  },

  // ── DEPLOY — More providers ────────────────────────────────────────────────
  {
    id: 'fly-io',
    name: 'Fly.io',
    category: 'deploy',
    description: 'A + AAAA records for a Fly.io app with a custom domain.',
    color: 'blue',
    note: 'Fly requires per-app dedicated IPs. Run: flyctl ips allocate-v4/v6 -a <app>, then replace placeholders. IPv4 costs $2/mo. After pointing DNS, run: flyctl certs create {DOMAIN}',
    records: [
      { name: '@', record_type: 'A',    content: 'YOUR_FLY_IPV4', ttl: 3600 },
      { name: '@', record_type: 'AAAA', content: 'YOUR_FLY_IPV6', ttl: 3600 },
    ],
  },
  {
    id: 'render',
    name: 'Render',
    category: 'deploy',
    description: 'CNAME for www subdomain pointing to a Render service.',
    color: 'green',
    note: 'Replace YOUR-SERVICE with your Render service subdomain from Render dashboard → Custom Domains. For apex (@) domains, use Cloudflare CNAME Flattening or your registrar\'s ALIAS record.',
    records: [
      { name: 'www', record_type: 'CNAME', content: 'YOUR-SERVICE.onrender.com', ttl: 3600 },
    ],
  },
  {
    id: 'railway',
    name: 'Railway',
    category: 'deploy',
    description: 'CNAME pointing to a Railway service custom domain.',
    color: 'gray',
    note: 'Copy the exact CNAME target from Railway dashboard → your service → Settings → Domains. Format: <unique-id>.up.railway.app. Railway also requires a domain ownership TXT record shown in the same panel.',
    records: [
      { name: 'www', record_type: 'CNAME', content: 'YOUR-ID.up.railway.app', ttl: 3600 },
    ],
  },

  // ── UTILITY ───────────────────────────────────────────────────────────────
  {
    id: 'google-site-verification',
    name: 'Google Search Console',
    category: 'utility',
    description: 'TXT record for verifying domain ownership in Google Search Console or Google Workspace.',
    color: 'blue',
    note: 'Replace YOUR_VERIFICATION_TOKEN with the token from Google Search Console → Add Property → Domain → DNS verification. Propagation takes up to 48h; Google usually verifies within minutes.',
    records: [
      { name: '@', record_type: 'TXT', content: 'google-site-verification=YOUR_VERIFICATION_TOKEN', ttl: 3600 },
    ],
  },
  {
    id: 'subdomain-delegation',
    name: 'Subdomain NS Delegation',
    category: 'utility',
    description: 'Delegate a subdomain zone to external nameservers via NS records in the parent zone.',
    color: 'gray',
    note: 'Replace "sub" with your actual subdomain and update the NS hostnames. Cloudflare: disable proxy on NS-delegated names. Add glue A records only if NS hostnames are within the delegated subdomain itself.',
    records: [
      { name: 'sub', record_type: 'NS', content: 'ns1.otherprovider.com.', ttl: 3600 },
      { name: 'sub', record_type: 'NS', content: 'ns2.otherprovider.com.', ttl: 3600 },
    ],
  },
]

export const TEMPLATE_CATEGORIES: { id: DnsTemplate['category']; label: string; icon: ReactNode }[] = [
  { id: 'web',      label: 'Web Hosting',  icon: <GlobeIcon size={13} /> },
  { id: 'email',    label: 'Email',        icon: <MailIcon size={13} /> },
  { id: 'deploy',   label: 'Deployments',  icon: <RocketIcon size={13} /> },
  { id: 'security', label: 'Security',     icon: <LockIcon size={13} /> },
  { id: 'utility',  label: 'Utilities',    icon: <WrenchIcon size={13} /> },
]

export const TEMPLATE_COLORS: Record<string, { card: string; badge: string }> = {
  blue:   { card: 'border-blue-200 bg-blue-50 hover:border-blue-300',       badge: 'bg-blue-100 text-blue-700' },
  indigo: { card: 'border-indigo-200 bg-indigo-50 hover:border-indigo-300', badge: 'bg-indigo-100 text-indigo-700' },
  green:  { card: 'border-tundra-lichen-200 bg-tundra-lichen-50 hover:border-tundra-lichen-300', badge: 'bg-tundra-lichen-100 text-tundra-lichen-700' },
  red:    { card: 'border-red-200 bg-red-50 hover:border-red-300',          badge: 'bg-red-100 text-red-700' },
  orange: { card: 'border-orange-200 bg-orange-50 hover:border-orange-300', badge: 'bg-orange-100 text-orange-700' },
  purple: { card: 'border-purple-200 bg-purple-50 hover:border-purple-300', badge: 'bg-purple-100 text-purple-700' },
  teal:   { card: 'border-teal-200 bg-teal-50 hover:border-teal-300',       badge: 'bg-teal-100 text-teal-700' },
  yellow: { card: 'border-yellow-200 bg-yellow-50 hover:border-yellow-300', badge: 'bg-yellow-100 text-yellow-700' },
  gray:   { card: 'border-tundra-ink-200 bg-tundra-ink-50 hover:border-tundra-ink-300', badge: 'bg-tundra-ink-100 text-tundra-ink-600' },
}

export function substituteContent(content: string, ip: string, domain: string): string {
  return content
    .replace(/\{IP\}/g,     ip     || 'YOUR_SERVER_IP')
    .replace(/\{DOMAIN\}/g, domain || 'YOUR_DOMAIN')
}

// ─── Template Picker ───────────────────────────────────────────────────────────

export function TemplatePicker({ onSelect }: { onSelect: (t: DnsTemplate) => void }) {
  const [activeCategory, setActiveCategory] = useState<DnsTemplate['category']>('web')
  const categoryTemplates = DNS_TEMPLATES.filter((t) => t.category === activeCategory)

  return (
    <div className="rounded-xl border border-tundra-ink-200 bg-tundra-ink-50 p-4">
      <div className="mb-3 flex gap-1 flex-wrap">
        {TEMPLATE_CATEGORIES.map((cat) => (
          <button key={cat.id} type="button" onClick={() => { setActiveCategory(cat.id) }}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeCategory === cat.id
                ? 'bg-white text-tundra-ink shadow-sm border border-tundra-ink-200'
                : 'text-tundra-ink-500 hover:bg-white/60 hover:text-tundra-ink'
            }`}>
            <span className="mr-1 flex items-center">{cat.icon}</span>{cat.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {categoryTemplates.map((t) => {
          const c = TEMPLATE_COLORS[t.color] ?? TEMPLATE_COLORS.gray
          return (
            <button key={t.id} type="button" onClick={() => { onSelect(t) }}
              className={`rounded-xl border p-3 text-left transition-all ${c.card}`}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-sm font-semibold text-tundra-ink">{t.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${c.badge}`}>
                  {t.records.length} rec
                </span>
              </div>
              <p className="text-xs leading-snug text-tundra-ink-500">{t.description}</p>
              {t.note && (
                <p className="mt-1.5 flex items-center gap-0.5 text-[10px] leading-snug text-yellow-700">
                  <WarningIcon size={10} /> Needs extra step
                </p>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Template Import Modal ─────────────────────────────────────────────────────

export function TemplateImportModal({
  template, ip, domain, onImport, onClose, importing,
}: {
  template: DnsTemplate; ip: string; domain: string
  onImport: (records: TplRecord[]) => void; onClose: () => void; importing: boolean
}) {
  const [checked, setChecked] = useState<Set<number>>(() => new Set(template.records.map((_, i) => i)))

  function toggle(i: number) {
    setChecked((prev) => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next })
  }

  const selected = template.records.filter((_, i) => checked.has(i))
  const needsIp  = template.records.some((r) => r.content.includes('{IP}'))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl border border-tundra-ink-200 bg-white shadow-xl" onClick={(e) => { e.stopPropagation() }}>
        <div className="flex items-start justify-between border-b border-tundra-ink-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-tundra-ink">{template.name}</h2>
            <p className="mt-0.5 text-xs text-tundra-ink-500">{template.description}</p>
          </div>
          <button type="button" onClick={onClose} className="ml-4 rounded p-0.5 text-tundra-ink-300 hover:bg-tundra-ink-100 hover:text-tundra-ink">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-4 space-y-3">
          {needsIp && !ip && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
              <span className="font-semibold">Server IP not resolved.</span> Records using <span className="font-mono font-semibold">{'{IP}'}</span> will have <span className="font-mono font-semibold">YOUR_SERVER_IP</span> as a placeholder — edit after import.
            </div>
          )}
          {template.note && (
            <div className="rounded-lg border border-tundra-aurora-200 bg-tundra-aurora-50 px-3 py-2 text-xs text-tundra-aurora-800">
              <span className="font-semibold">Note:</span> {template.note}
            </div>
          )}
          <div>
            <p className="mb-2 text-xs font-medium text-tundra-ink-500">
              <span className="font-semibold text-tundra-ink">{checked.size}</span> of {template.records.length} records selected
            </p>
            <div className="overflow-hidden rounded-xl border border-tundra-ink-200">
              <table className="w-full text-sm">
                <thead className="border-b border-tundra-ink-100 text-xs text-tundra-ink-400">
                  <tr>
                    <th className="w-8 px-3 py-2.5"></th>
                    <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wide">Type</th>
                    <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wide">Name</th>
                    <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wide">Content</th>
                    <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wide">TTL</th>
                    <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wide">Prio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tundra-ink-100">
                  {template.records.map((r, i) => {
                    const resolved       = substituteContent(r.content, ip, domain)
                    const isChecked      = checked.has(i)
                    const hasPlaceholder = resolved.includes('YOUR_')
                    return (
                      <tr key={i} onClick={() => { toggle(i) }}
                        className={`cursor-pointer transition-colors ${isChecked ? 'bg-white hover:bg-tundra-ink-50' : 'bg-tundra-ink-50/60 opacity-40 hover:opacity-60'}`}>
                        <td className="px-3 py-2.5 text-center">
                          <input type="checkbox" checked={isChecked} onChange={() => { toggle(i) }}
                            onClick={(e) => { e.stopPropagation() }}
                            className="h-3.5 w-3.5 rounded accent-tundra-lichen" />
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${RECORD_TYPE_CLS[r.record_type] ?? 'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-500'}`}>
                            {r.record_type}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-tundra-ink">{r.name}</td>
                        <td className="max-w-[14rem] truncate px-3 py-2.5" title={resolved}>
                          <span className={`font-mono text-xs ${hasPlaceholder ? 'text-yellow-700' : 'text-tundra-ink-600'}`}>{resolved}</span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-tundra-ink-400">{r.ttl}s</td>
                        <td className="px-3 py-2.5 text-xs text-tundra-ink-400">{r.priority ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-tundra-ink-100 px-6 py-4">
          <button type="button"
            onClick={() => { setChecked(checked.size === template.records.length ? new Set() : new Set(template.records.map((_, i) => i))) }}
            className="text-xs text-tundra-ink-500 underline-offset-2 hover:text-tundra-ink hover:underline">
            {checked.size === template.records.length ? 'Deselect all' : 'Select all'}
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-tundra-ink-200 px-4 py-2 text-sm text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
              Cancel
            </button>
            <button type="button" disabled={selected.length === 0 || importing}
              onClick={() => { onImport(selected) }}
              className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
              {importing ? 'Importing…' : `Import ${selected.length} record${selected.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

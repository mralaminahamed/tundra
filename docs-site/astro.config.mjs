// @ts-check
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

export default defineConfig({
  site: 'https://mralaminahamed.github.io',
  base: '/tundra',
  integrations: [
    starlight({
      title: 'Tundra',
      tagline: 'Self-hosted server management — done right.',
      logo: {
        light: './src/assets/tundra-logo-dark.svg',
        dark:  './src/assets/tundra-logo-light.svg',
        replacesTitle: true,
      },
      favicon: '/favicon.svg',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/mralaminahamed/tundra' },
        { icon: 'x.com',  label: 'X',      href: 'https://x.com/mralaminahamed' },
      ],
      editLink: {
        baseUrl: 'https://github.com/mralaminahamed/tundra/edit/main/docs-site/',
      },
      lastUpdated: true,
      pagination: true,
      expressiveCode: {
        themes: ['github-dark', 'github-light'],
        styleOverrides: {
          borderRadius: '0.5rem',
          borderWidth: '1px',
        },
      },
      components: {
        Hero: './src/components/overrides/Hero.astro',
      },
      customCss: ['./src/styles/custom.css'],
      head: [
        {
          tag: 'link',
          attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        },
        {
          tag: 'link',
          attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap',
          },
        },
        {
          tag: 'meta',
          attrs: { property: 'og:image', content: 'https://mralaminahamed.github.io/tundra/og.png' },
        },
        {
          tag: 'meta',
          attrs: { name: 'twitter:card', content: 'summary_large_image' },
        },
      ],
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Introduction',          slug: 'getting-started/introduction' },
            { label: 'Quick Install',         slug: 'getting-started/quick-install' },
            { label: 'Add Your First Server', slug: 'getting-started/first-server' },
            { label: 'Deploy a Site',         slug: 'getting-started/first-site' },
            { label: 'Upgrading',             slug: 'getting-started/upgrading' },
          ],
        },
        {
          label: 'Operator Guides',
          items: [
            { label: 'Sites & Deployments', slug: 'guides/sites' },
            { label: 'WordPress',           slug: 'guides/wordpress' },
            { label: 'File Manager',        slug: 'guides/file-manager' },
            { label: 'Databases',           slug: 'guides/databases' },
            { label: 'Domains & DNS',       slug: 'guides/domains-dns' },
            { label: 'Mail',                slug: 'guides/mail' },
            { label: 'Backups',             slug: 'guides/backups' },
            { label: 'Monitoring & Alerts', slug: 'guides/monitoring' },
            { label: 'Multi-server Fleet',  slug: 'guides/multi-server' },
          ],
        },
        {
          label: 'Self-Hosting',
          items: [
            { label: 'Overview',             slug: 'self-hosting/overview' },
            { label: 'Docker Compose',       slug: 'self-hosting/docker-compose' },
            { label: 'Systemd (Production)', slug: 'self-hosting/systemd' },
            { label: 'Configuration',        slug: 'self-hosting/configuration' },
            { label: 'Security Hardening',   slug: 'self-hosting/security' },
          ],
        },
        {
          label: 'Plugins',
          items: [
            { label: 'Overview',         slug: 'plugins/overview' },
            { label: 'Using Plugins',    slug: 'plugins/using-plugins' },
            { label: 'Building Plugins', slug: 'plugins/building-plugins' },
            { label: 'MCP Integration',  slug: 'plugins/mcp' },
          ],
        },
        {
          label: 'API Reference',
          items: [
            { label: 'Overview',            slug: 'api/overview' },
            { label: 'Authentication',      slug: 'api/authentication' },
            { label: 'Errors & Pagination', slug: 'api/errors' },
            { label: 'REST Endpoints',      slug: 'api/endpoints' },
            { label: 'WebSocket Events',    slug: 'api/websocket' },
          ],
        },
        {
          label: 'Contributing',
          items: [
            { label: 'Developer Guide',  slug: 'contributing/developer-guide' },
            { label: 'Local Dev Setup',  slug: 'contributing/local-dev' },
            { label: 'Architecture',     slug: 'contributing/architecture' },
            { label: 'Testing',          slug: 'contributing/testing' },
            { label: 'Hard Constraints', slug: 'contributing/constraints' },
          ],
        },
      ],
    }),
  ],
})

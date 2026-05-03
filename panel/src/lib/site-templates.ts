export interface SiteTemplate {
  id: string
  label: string
  description: string
  kind: string
  runtimeVersion: string
  buildCommand: string
  startCommand: string
  listenPort: string
  sourceKind: 'template'
}

export const SITE_TEMPLATES: SiteTemplate[] = [
  {
    id: 'static',
    label: 'Static site',
    description: 'Plain HTML/CSS/JS — no build step required.',
    kind: 'static',
    runtimeVersion: '',
    buildCommand: '',
    startCommand: '',
    listenPort: '',
    sourceKind: 'template',
  },
  {
    id: 'nextjs',
    label: 'Next.js',
    description: 'React framework with SSR/SSG. Requires Node 20+.',
    kind: 'nodejs',
    runtimeVersion: '22',
    buildCommand: 'npm ci && npm run build',
    startCommand: 'node .next/standalone/server.js',
    listenPort: '3000',
    sourceKind: 'template',
  },
  {
    id: 'django',
    label: 'Django',
    description: 'Python web framework. Uses Gunicorn in production.',
    kind: 'python',
    runtimeVersion: '3.13',
    buildCommand: 'pip install -r requirements.txt',
    startCommand: 'gunicorn config.wsgi:application --bind 0.0.0.0:$PORT',
    listenPort: '8000',
    sourceKind: 'template',
  },
  {
    id: 'fastapi',
    label: 'FastAPI',
    description: 'Modern async Python API. Uses Uvicorn in production.',
    kind: 'python',
    runtimeVersion: '3.13',
    buildCommand: 'pip install -r requirements.txt',
    startCommand: 'uvicorn main:app --host 0.0.0.0 --port $PORT',
    listenPort: '8000',
    sourceKind: 'template',
  },
  {
    id: 'rails',
    label: 'Ruby on Rails',
    description: 'Full-stack Ruby framework. Uses Puma in production.',
    kind: 'ruby',
    runtimeVersion: '3.4',
    buildCommand: 'bundle install --without development test && bundle exec rake assets:precompile',
    startCommand: 'bundle exec puma -C config/puma.rb',
    listenPort: '3000',
    sourceKind: 'template',
  },
]

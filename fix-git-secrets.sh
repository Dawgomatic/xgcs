#!/bin/bash

echo "🔐 Fixing GitHub Secrets Issue"
echo "=============================="
echo ""

# Check if we're in the right directory
if [ ! -f ".gitignore" ]; then
    echo "❌ Error: Please run this script from the xgcs directory"
    exit 1
fi

echo "📋 The issue: GitHub detected SSH private keys in node_modules"
echo "🔧 Solution: Remove node_modules from git tracking"
echo ""

# Remove node_modules from git tracking
echo "🗑️  Removing node_modules from git tracking..."
git rm -r --cached server/node_modules 2>/dev/null || echo "  server/node_modules not tracked"
git rm -r --cached client/node_modules 2>/dev/null || echo "  client/node_modules not tracked"
git rm -r --cached node_modules 2>/dev/null || echo "  root node_modules not tracked"

# Update .gitignore to be more comprehensive
echo ""
echo "📝 Updating .gitignore..."
cat >> .gitignore << 'EOF'

# Additional node_modules patterns
**/node_modules/
**/node_modules/**
node_modules/
node_modules/**

# Logs
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Runtime data
pids/
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
*.lcov

# nyc test coverage
.nyc_output

# Dependency directories
jspm_packages/

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Microbundle cache
.rpt2_cache/
.rts2_cache_cjs/
.rts2_cache_es/
.rts2_cache_umd/

# Optional REPL history
.node_repl_history

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity

# dotenv environment variables file
.env
.env.test

# parcel-bundler cache (https://parceljs.org/)
.cache
.parcel-cache

# next.js build output
.next

# nuxt.js build output
.nuxt

# vuepress build output
.vuepress/dist

# Serverless directories
.serverless/

# FuseBox cache
.fusebox/

# DynamoDB Local files
.dynamodb/

# TernJS port file
.tern-port

# Stores VSCode versions used for testing VSCode extensions
.vscode-test

# yarn v2
.yarn/cache
.yarn/unplugged
.yarn/build-state.yml
.yarn/install-state.gz
.pnp.*
EOF

echo "✅ .gitignore updated"

# Commit the changes
echo ""
echo "📝 Committing changes..."
git add .gitignore
git commit -m "Remove node_modules from tracking and update .gitignore"

echo ""
echo "🎯 Next steps:"
echo "1. Try pushing again: git push"
echo "2. If still blocked, you may need to:"
echo "   - Go to the GitHub URL shown in the error"
echo "   - Click 'Allow' for the detected secret"
echo "   - Or remove the specific file from git history"
echo ""
echo "🔍 To check what's being tracked:"
echo "   git ls-files | grep node_modules"

echo ""
echo "✅ Fix complete! Try pushing again." 
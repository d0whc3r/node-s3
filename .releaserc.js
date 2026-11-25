module.exports = {
  branches: [
    'master',
    'next',
    'next-major',
    {
      name: 'beta',
      prerelease: true
    },
    {
      name: 'alpha',
      prerelease: true
    }
  ],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    ['@semantic-release/changelog', { changelogFile: 'CHANGELOG.md', changelogTitle: '# Changelog' }],
    '@semantic-release/npm',
    [
      '@semantic-release/git',
      {
        assets: ['package.json', 'CHANGELOG.md'],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}'
      }
    ],
    [
      '@semantic-release/github',
      {
        assets: [
          { path: 'release-assets/node-s3-linux-x64', label: 'node-s3 (Linux x64)' },
          { path: 'release-assets/node-s3-macos-arm64', label: 'node-s3 (macOS arm64)' },
          { path: 'release-assets/node-s3-win-x64.exe', label: 'node-s3 (Windows x64)' }
        ]
      }
    ]
  ]
};

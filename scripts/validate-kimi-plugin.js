#!/usr/bin/env node

import { readFile, stat } from 'fs/promises';

const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

async function readJson(path) {
  const content = await readFile(path, 'utf8');
  return JSON.parse(content);
}

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function requireString(errors, object, field, prefix = '') {
  const value = object[field];
  const name = prefix ? `${prefix}.${field}` : field;
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${name} must be a non-empty string`);
    return undefined;
  }
  return value;
}

function requireHttpsUrl(errors, object, field, prefix = '') {
  const value = requireString(errors, object, field, prefix);
  if (!value) return;

  const label = prefix ? `${prefix}.${field}` : field;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') {
      errors.push(`${label} must use https`);
    }
  } catch {
    errors.push(`${label} must be an absolute URL`);
  }
}

function requireSameMcpServers(errors, manifest, rootConfig) {
  const manifestServers = manifest.mcpServers;
  if (
    !manifestServers ||
    typeof manifestServers !== 'object' ||
    Array.isArray(manifestServers)
  ) {
    errors.push('mcpServers must be an object of MCP server declarations');
    return;
  }

  const rootServers = rootConfig.mcpServers;
  const manifestNames = Object.keys(manifestServers).sort();
  const rootNames = Object.keys(rootServers).sort();
  if (JSON.stringify(manifestNames) !== JSON.stringify(rootNames)) {
    errors.push(
      `mcpServers must declare the same servers as .mcp.json (${rootNames.join(', ')})`
    );
    return;
  }

  for (const serverName of manifestNames) {
    if (
      JSON.stringify(manifestServers[serverName]) !==
      JSON.stringify(rootServers[serverName])
    ) {
      errors.push(
        `mcpServers.${serverName} must match the declaration in .mcp.json`
      );
    }
  }
}

async function main() {
  const errors = [];
  const manifestPath = 'kimi.plugin.json';

  let manifest;
  try {
    manifest = await readJson(manifestPath);
  } catch (error) {
    console.error('Kimi plugin validation failed:');
    console.error(
      `- ${manifestPath} must exist and contain valid JSON (${error.message})`
    );
    process.exit(1);
  }

  const pluginName = requireString(errors, manifest, 'name');
  if (pluginName && !NAME_RE.test(pluginName)) {
    errors.push('name must match [a-z0-9][a-z0-9_-]{0,63}');
  }
  const version = requireString(errors, manifest, 'version');
  if (version && !SEMVER_RE.test(version)) {
    errors.push('version must be strict semver');
  }
  requireString(errors, manifest, 'description');

  if (!manifest.author || typeof manifest.author !== 'object') {
    errors.push('author must be an object');
  } else {
    requireString(errors, manifest.author, 'name', 'author');
    if (manifest.author.url) {
      requireHttpsUrl(errors, manifest.author, 'url', 'author');
    }
  }

  if (manifest.homepage) {
    requireHttpsUrl(errors, manifest, 'homepage');
  }

  if (
    !Array.isArray(manifest.skills) ||
    manifest.skills.length === 0 ||
    !manifest.skills.every(
      (value) => typeof value === 'string' && value.startsWith('./')
    )
  ) {
    errors.push('skills must be a non-empty array of "./" paths');
  } else {
    for (const skillPath of manifest.skills) {
      if (!(await isDirectory(skillPath))) {
        errors.push(`skills path "${skillPath}" must be an existing directory`);
      }
    }
  }

  const rootConfig = await readJson('.mcp.json');
  requireSameMcpServers(errors, manifest, rootConfig);

  if (manifest.interface) {
    if (typeof manifest.interface !== 'object') {
      errors.push('interface must be an object');
    } else {
      for (const field of [
        'displayName',
        'shortDescription',
        'longDescription',
        'developerName'
      ]) {
        requireString(errors, manifest.interface, field, 'interface');
      }
      if (manifest.interface.websiteURL) {
        requireHttpsUrl(errors, manifest.interface, 'websiteURL', 'interface');
      }
    }
  }

  if (errors.length > 0) {
    console.error('Kimi plugin validation failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log('Kimi plugin validation passed');
}

main().catch((error) => {
  console.error(`Kimi plugin validation failed: ${error.message}`);
  process.exit(1);
});

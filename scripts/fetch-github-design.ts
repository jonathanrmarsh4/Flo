import { Octokit } from '@octokit/rest';
import * as fs from 'fs/promises';
import * as path from 'path';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('GitHub not connected');
  }
  return accessToken;
}

async function getGitHubClient() {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

async function downloadRepoContents() {
  const octokit = await getGitHubClient();
  const owner = 'Nuvitae-Labs';
  const repo = 'Fl';
  const outputDir = './github-design';

  console.log(`Fetching repository: ${owner}/${repo}`);

  try {
    const { data: repoData } = await octokit.repos.get({ owner, repo });
    console.log(`Repository found: ${repoData.name}`);
    console.log(`Default branch: ${repoData.default_branch}`);

    const { data: tree } = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: repoData.default_branch,
      recursive: 'true'
    });

    console.log(`Found ${tree.tree.length} items in repository`);

    await fs.mkdir(outputDir, { recursive: true });

    for (const item of tree.tree) {
      if (item.type === 'blob' && item.path) {
        console.log(`Downloading: ${item.path}`);
        
        const { data: blob } = await octokit.git.getBlob({
          owner,
          repo,
          file_sha: item.sha!
        });

        const filePath = path.join(outputDir, item.path);
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });

        const content = Buffer.from(blob.content, 'base64');
        await fs.writeFile(filePath, content);
      }
    }

    console.log('\nDownload complete!');
    console.log(`Files saved to: ${outputDir}`);
    
    const structure = await fs.readdir(outputDir);
    console.log('\nRepository structure:');
    console.log(structure);

  } catch (error: any) {
    console.error('Error fetching repository:', error.message);
    throw error;
  }
}

downloadRepoContents().catch(console.error);

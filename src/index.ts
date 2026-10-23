import core = require('@actions/core');
import exec = require('@actions/exec');
import glob = require('@actions/glob');
import tc = require('@actions/tool-cache');
import io = require('@actions/io');
import path = require('path');
import fs = require('fs');

const main = async () => {
    try {
        await run();
    } catch (error) {
        core.setFailed(error);
    }
}

main();

async function run(): Promise<void> {
    let version = (core.getInput('version') || 'latest').trim().toLowerCase();
    if (version === 'latest') {
        version = '';
    } else if (!/^\d+\.\d+\.\d+\.\d+$/.test(version)) {
        throw new Error(`Invalid version string: ${version}`);
    }
    let installedVersion = await getInstalledVersion();
    if (installedVersion && version && version !== installedVersion) {
        core.info(`Installed version ${installedVersion} does not match requested version ${version}`);
    }
    if (!installedVersion || (version && version !== installedVersion)) {
        await install(version);
        installedVersion = await getInstalledVersion();
    }
    if (!installedVersion) {
        throw new Error('Failed to call cm command after install!');
    }
    if (version && version !== installedVersion) {
        throw new Error(`Installed version ${installedVersion} does not match requested version ${version}`);
    }
    const cmPath = await io.which('cm', true);
    core.info(`PLASTIC_SCM_PATH -> ${cmPath}`);
    core.exportVariable('PLASTIC_SCM_PATH', cmPath);
    core.setOutput('path', cmPath);
    core.setOutput('version', installedVersion);
}

async function getInstalledVersion(): Promise<string | undefined> {
    let output = '';
    try {
        await exec.exec('cm', ['version'], {
            listeners: {
                stdout: (data: Buffer) => {
                    output += data.toString();
                }
            }
        });
    } catch (error) {
        return undefined;
    }
    const versionMatch = output.match(/\d+\.\d+\.\d+\.\d+/);
    return versionMatch ? versionMatch[0] : output.trim();
}

function getTempDirectory(): string {
    return process.env['RUNNER_TEMP'] || '';
}

async function install(version: string) {
    switch (process.platform) {
        case 'win32': return await installWindows(version);
        case 'darwin': return await installMac(version);
        case 'linux': return await installLinux(version);
    }
}

async function getDownloadUrl(version: string): Promise<[string, string]> {
    switch (process.platform) {
        case 'win32': return [`https://www.plasticscm.com/download/downloadinstaller/${version}/plasticscm/windows/cloudedition`, `unity-vcs-${version}-win.exe`];
        case 'darwin': return [`https://www.plasticscm.com/download/downloadinstaller/${version}/plasticscm/macosx/cloudedition`, `unity-vcs-${version}-mac.pkg.zip`];
        default: throw new Error(`Unsupported platform: ${process.platform}`);
    }
}

async function getToolLatestVersion(): Promise<string> {
    core.info('Getting latest version...');
    const response = await fetch('https://www.plasticscm.com/download');
    const body = await response.text();
    const versionMatch = body.match(/<strong>Version:\s*<\/strong>(\d+\.\d+\.\d+\.\d+)/);
    if (!versionMatch) {
        throw new Error('Failed to parse version');
    }
    const version = versionMatch[1];
    core.info(`Latest version: ${version}`);
    return version;
}

async function installWindows(version: string) {
    if (!version) {
        version = await getToolLatestVersion();
    }
    const [url, archiveName] = await getDownloadUrl(version);
    core.info(`Downloading ${archiveName} from ${url}...`);
    const installerPath = path.join(getTempDirectory(), archiveName);
    const downloadPath = await tc.downloadTool(url, installerPath);
    await exec.exec(`cmd`, ['/c', downloadPath, '--mode', 'unattended', '--unattendedmodeui', 'none']);
    await fs.promises.unlink(downloadPath);
    core.addPath('C:\\Program Files\\PlasticSCM5\\client');
}

async function installMac(version: string) {
    if (!version) {
        version = await getToolLatestVersion();
    }
    const [url, archiveName] = await getDownloadUrl(version);
    core.info(`Downloading ${archiveName} from ${url}...`);
    const installerPath = path.join(getTempDirectory(), archiveName);
    const downloadPath = await tc.downloadTool(url, installerPath);
    const expandedPath = await tc.extractZip(downloadPath);
    const globber = await glob.create(path.join(expandedPath, '*.pkg'));
    const pkgPaths: string[] = await globber.glob();
    if (!pkgPaths || pkgPaths.length === 0) {
        throw new Error('Failed to find the installer package');
    }
    await exec.exec('sudo', ['installer', '-pkg', pkgPaths[0], '-target', '/Applications']);
    await fs.promises.unlink(downloadPath);
}

async function installLinux(version: string) {
    let installArg = 'plasticscm-cloud';
    if (version) {
        installArg += `=${version}`;
    }
    await exec.exec('sudo', ['apt-get', 'update']);
    await exec.exec('sudo', ['apt-get', 'install', '-y', 'apt-transport-https']);
    const keyring = '/etc/apt/keyrings/plasticscm-stable.gpg';
    const keyPath = path.join(getTempDirectory(), 'plasticscm-Release.key');
    await tc.downloadTool('https://www.plasticscm.com/plasticrepo/stable/debian/Release.key', keyPath);
    await exec.exec('sudo', ['install', '-d', '-m', '0755', '/etc/apt/keyrings']);
    await exec.exec('sudo', ['gpg', '--batch', '--yes', '--dearmor', '-o', keyring, keyPath]);
    await exec.exec('sudo', ['chmod', '0644', keyring]);
    await fs.promises.unlink(keyPath);
    await exec.exec('sudo', ['sh', '-c', `echo "deb [signed-by=${keyring}] https://www.plasticscm.com/plasticrepo/stable/debian/ ./" > /etc/apt/sources.list.d/plasticscm-stable.list`]);
    await exec.exec('sudo', ['apt-get', 'update']);
    await exec.exec('sudo', ['apt-get', 'install', '-y', '--allow-downgrades', installArg]);
}

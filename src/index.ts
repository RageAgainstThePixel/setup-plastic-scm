import core = require('@actions/core');
import exec = require('@actions/exec');
import glob = require('@actions/glob');
import tc = require('@actions/tool-cache');
import path = require('path');
import fs = require('fs');

const main = async () => {
    try {
        run();
    } catch (error) {
        core.setFailed(error);
    }
}

main();

async function run(): Promise<void> {
    try {
        await exec.exec('cm', ['version']);
    } catch (error) {
        await install();
        try {
            await exec.exec('cm', ['version']);
        } catch (error) {
            core.error(`Failed to call cm command!\n${error}`);
        }
    }
}

function getTempDirectory(): string {
    return process.env['RUNNER_TEMP'] || '';
}

async function install() {
    const version = core.getInput('version');
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
    await exec.exec(`cmd`, ['/c', downloadPath, '--mode', 'unattended', '--unattendedmodeui', 'none', '--disable-components', 'ideintegrations,eclipse,mylyn,intellij12']);
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
    await exec.exec('sudo', ['sh', '-c', `echo "deb https://www.plasticscm.com/plasticrepo/stable/debian/ ./" | sudo tee /etc/apt/sources.list.d/plasticscm-stable.list`]);
    await exec.exec('sudo', ['wget', 'https://www.plasticscm.com/plasticrepo/stable/debian/Release.key', '-O', 'Release.key']);
    await exec.exec('sudo', ['apt-key', 'add', 'Release.key']);
    await exec.exec('sudo', ['apt-get', 'update']);
    await exec.exec('sudo', ['apt-get', 'install', installArg]);
}

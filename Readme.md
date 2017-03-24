# elm-github-install

> Fork of [gdotdesign/elm-github-install](https://github.com/gdotdesign/elm-github-install/tree/0.2.0) with Gitlab support.

# Usefulness
This is a hack. Plain and simple. Ideally, Elm will move to support other repositories. But until that happens, there's this.


# Gitlab Server Configuration

Gitlab must be configured properly to work with this install program.

## Protocols

Gitlab must support HTTPS and GIT protocols.

### Git protocol configuration

The following are the steps necessary to support the GIT protocol for Gitlab on Ubuntu.

1. Create `local-git-daemon.conf`
2. Add line to `rc.local`
3. Start daemon

#### Create `local-git-daemon.conf`

```bash
sudo nano /etc/init/local-git-daemon.conf
```
Add the following lines:
```bash
start on startup
stop on shutdown
exec /usr/bin/git daemon \
    --user=git --group=git --enable=upload-pack --export-all \
    --syslog  --verbose  --reuseaddr --base-path-relaxed \
    --base-path=<path-to-repositiory-root> \
    <path-to-repositiory-root> \
respawn
```
where `<path-to-repositiory-root>` must be changed in 2 places.

N.B. `--export-all` will export all repositories via `git://`. This may NOT be what you want in your environment. (We run Gitlab on our VPN so it works for us.)

You may want to NOT include this option and instead place the empty file, `git-daemon-export-ok`, in the directory. Note that permission issues may prevent this from working.

#### Add line to `rc.local`

In order to auto start the Git Daemon, we must add a line to start it to `rc.local`:

```bash
sudo nano /etc/rc.local
```

Add the following line:

```bash
sudo initctl start local-git-daemon
```

#### Start daemon

```bash
sudo initctl start local-git-daemon
```
# Gitlab Group/Project configuration

## Archivist User

To get an archive from Gitlab using the REST API, credentials must be provided. The approach taken was to create a user with `Reporter` role in the `Group` or in the `Project`.

Then the `Private Token` of that user will be used in the `elm-package.json` file to allow retrieval of the archive.

**N.B. This is a potential security vunerability. Since we're using Gitlab on our VPN, everyone who has access is authenticated via 2-factor authentication and therefore not a security issue.**

# Elm Project configuration

In the `elm-package-json`, there are 2 new sections to support Gitlab, `gitlab-tokens` and `gitlab-dependencies`:

```json
{
    "version": "1.0.0",
    "summary": "My Project",
    "repository": "https://github.com/nobody/norepo.git",
    "license": "Unlicense",
    "source-directories": [
        "src"
    ],
    "exposed-modules": [
		"MyModule"
	],
    "dependencies": {
        "elm-lang/core": "4.0.5 <= v < 5.0.0",
        "elm-lang/html": "1.1.0 <= v < 2.0.0",
		"guardian/session-service": "1.0.0 <= v < 2.0.0"
    },
    "gitlab-tokens": {
        "gitlab.panosoft.com": "yEop81GbnEQLjkHEajHO"
    },
    "gitlab-dependencies": {
        "gitlab.panosoft.com/guardian/session-service": "1.0.0 <= v < 2.0.0"
    },
    "elm-version": "0.17.1 <= v < 0.18.0"
}
```
## Dependency key
Notice that `guardian/session-service` is here even though it comes from Gitlab. That's because the Elm compiler relies on this for the `import` statement. This is unfortunate but the versions SHOULD match but the one that matters is the one in `gitlab-dependencies`.

## Repository key
Normally, you put your Github repo address here. It can ONLY be a Github address. If your project is NOT on Github, e.g. Gitlab, you have to still put a Github address here otherwise the Elm compiler will generate an error.

## Gitlab Tokens key
Each server address has an Archivist User token. This is to allow `elm-github-install` to grab an archive from your Gitlab server and provide authentication in the REST call.

## Gitlab Dependencies key
This is identical to the `dependencies` key with the exception of the server prefix. This could not be put into the `dependencies` key since the Elm compiler will generate an error.

# Installation

```bash
npm install -g git://github.com/panosoft/elm-github-install
```

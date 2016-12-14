var SemverResolver = require('semver-resolver').SemverResolver
var exec = require('child_process').exec
var extract = require('extract-zip')
var request = require('request')
var semver = require('semver')
var colors = require('colors')
var async = require('async')
var path = require('path')
var tmp = require('tmp')
var fs = require('fs')
var GitlabDownload = require('gitlab-download')
var mkdirpSync = require('mkdirp').sync

var fullPackage = function(package) {
  var fullPackage;
  if (!/[.]/.test(package))
    fullPackage = 'github.com/' + package
  else
    fullPackage = package
  return fullPackage
}
var packageName = function(package) {
  var packageName
  if (!/[.]/.test(package))
    packageName = package
  else {
    var packageParts = package.split('/')
    packageParts.shift()
    packageName = packageParts.join('/')
  }
  return packageName
}
var getServer = function(package) {
  var server = package.split('/')[0]
  return server.indexOf('.') == -1 ? '' : server
}
var getToken = function(package, gitlabTokens) {
	return gitlabTokens[getServer(package)]
}
var getTokenParam = function(package, gitlabTokens) {
	var token = getToken(package, gitlabTokens)
	return token ? '?private_token=' + token : ''
};

// Returns a function that downloads the given github repository at the given
// reference and extracts it to elm-stuff/packages/owner/repository/reference
var installExternalPackage = function(package, ref, gitlabTokens) {
  return function(callback){
    // Skip if it's already downloaded
    if(fs.existsSync(path.resolve('elm-stuff/packages/' + packageName(package) + '/' + ref))){
      return callback()
    }

	var packagePath = path.resolve('elm-stuff/packages/' + packageName(package))
	var token = getToken(package, gitlabTokens)
	if (token) {
        var dest = path.resolve(packagePath, ref);
        mkdirpSync(dest)
        var gitlab = new GitlabDownload('https://' + getServer(package), token)
		gitlab.download({remote: 'api/v3/projects/' + encodeURIComponent(packageName(package)), dest})
		.then(function() {
			console.log(' ●'.green, packageName(package) + ' - ' + ref)
			callback()
		}, function(error) {
            // Remove the dir
			fs.rmdirSync(dest)
			console.log(' ✘'.red, package + ' - ' + ref)
			console.log('   ▶', error)
			callback(true)
		})
	}
	else {
      var archiveUrl = 'https://' + fullPackage(package) + '/archive/' + ref + '.zip'
      // Set up a temp file to store the archive in
      var tmpFile = tmp.fileSync()
      // Get the archive into the temp file
      request
        .get(archiveUrl)
        .pipe(fs.createWriteStream(tmpFile.name))
        .on('finish', function(){
          // Extract the contents to the directory
          extract(tmpFile.name, { dir: packagePath }, function(error){
            if(error) {
              console.log(' ✘'.red, package + ' - ' + ref)
              console.log('   ▶', error)
              callback(true)
            } else {
              // Rename the directory the archived had ( core-4.0.4 ) to
              // the given reference (4.0.4)
              var repo = package.split('/').pop()
              fs.renameSync(path.resolve(packagePath, repo + '-' + ref),
                            path.resolve(packagePath, ref))
              console.log(' ●'.green, package + ' - ' + ref)
              callback()
            }
            // Remove the temp file
            tmpFile.removeCallback()
          })
        })
    }
  }
}

// Converts an Elm dependency version into a semver.
// For exmaple: 4.0.4 <= v < 5.0.0  becomes >= 4.0.4 < 5.0.0
var getSemerVersion = function(version) {
  var match = version.match(/(\d+\.\d+\.\d+)<=v<(\d+\.\d+\.\d+)/)
  if(match) { return '>=' + match[1] + ' <' + match[2] }
  var match = version.match(/(\d+\.\d+\.\d+)<=v<=(\d+\.\d+\.\d+)/)
  if(match) { return '>=' + match[1] + ' <=' + match[2] }
  var match = version.match(/(\d+\.\d+\.\d+)<v<=(\d+\.\d+\.\d+)/)
  if(match) { '>' + match[1] + ' <=' + match[2] }
  var match = version.match(/(\d+\.\d+\.\d+)<v<(\d+\.\d+\.\d+)/)
  if(match) { '>' + match[1] + ' <' + match[2] }
  return version
}

// Transform all Elm dependencies into the semver versions.
var transformDependencies = function(deps, gitlabDeps){
  // remove gitlab keys from deps
  var filterKeys = Object.keys(gitlabDeps || {}).map(function(key) {
	  return packageName(key)
  })
  deps = Object.keys(deps).reduce(function(newDeps, key) {
	  if (filterKeys.indexOf(key) == -1)
	  	newDeps[key] = deps[key]
	  return newDeps
  }, {})
  Object.keys(gitlabDeps || {}).forEach(function(key) {
	  deps[key] = gitlabDeps[key]
  })
  var result = {}
  Object.keys(deps).forEach(function(key) {
    result[key] = getSemerVersion(deps[key].replace(/\s/g, ''))
  })
  return result
}

// Get the dependencies for a given package and reference.
var getDependencies = function(gitlabTokens) {
  return function(package, ref) {
    return new Promise(function (fulfill, reject){
      getPackageJson(package, ref, gitlabTokens)
        .then(function(json){
          var deps = json.dependencies
          var gitlabDeps = json['gitlab-dependencies']
          Object.keys(gitlabDeps || {}).forEach(function(key) {
            deps[key] = gitlabDeps[key]
          })
          fulfill(transformDependencies(deps, json['gitlab-dependencies']))
      })
    })
  }
}

// Get the contents of the elm-package.json of the given package and reference
var getPackageJson = function(package, ref, gitlabTokens){
  var packageUrl = 'https://' + fullPackage(package) + '/raw/' + ref + '/elm-package.json' + getTokenParam(package, gitlabTokens)
  return new Promise(function (fulfill, reject){
    request.get(packageUrl, function(error, response, body){
      fulfill(JSON.parse(body))
    })
  })
}

// Get all available versions (tags) for a given package
var getVersions = function(package){
  return new Promise(function (fulfill, reject){
    var cmd = 'git ls-remote git://' + fullPackage(package) + ".git | awk -F/ '{ print $3 }'"
    exec(cmd, function(error, stdout, stderr){
      var versions = stdout.trim()
                           .split("\n")
                           .filter(function(version) {
                              // filter out not valid tags (0.2.3^{})
                              return semver.valid(version)
                           })
      fulfill(versions)
    })
  })
}

// The installer function
module.exports = function(){
  // Get the config of the elm-package.json
  var packageConfig = require(path.resolve('elm-package.json'))

  // Transform dependencies into semver versions
  var packages = transformDependencies(packageConfig.dependencies, packageConfig['gitlab-dependencies'])

  var gitlabTokens = packageConfig['gitlab-tokens'] || {}

  // Create a resolver
  var resolver = new SemverResolver(packages, getVersions, getDependencies(gitlabTokens))

  console.log('Resolving versions...')

  resolver.resolve().then(function(deps){
    // We have all the dependencies resolved
    // Create an array of install functions
    var installs = Object.keys(deps).map(function(package){
      return installExternalPackage(package, deps[package], gitlabTokens)
    })

    console.log('Starting downloads...\n')

    // Run installs in paralell
    async.parallel(installs, function(error){
      if(error) {
        console.log('\nSome packages failed to install!')
      } else {
        // remove server names from deps
		deps = Object.keys(deps).reduce(function(newDeps, key) {
			newDeps[packageName(key)] = deps[key]
			return newDeps
		}, {})
        // Write te exact-dependencies.json
        fs.writeFileSync(path.resolve('elm-stuff/exact-dependencies.json'),
                         JSON.stringify(deps, null, '  '))
        console.log('\nPackages configured successfully!')
      }
    })
  }, function(){
    console.log('error', arguments)
  })
}

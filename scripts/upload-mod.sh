#!/bin/bash
# Usage: ./scripts/upload-mod.sh <jar-path> <release-name>
# Example: ./scripts/upload-mod.sh /c/Users/Traoz/autoloot/build/libs/autoloot-1.0.jar betterwater.jar

JAR=$1
NAME=$2
REPO="traoz/traoz-launcher"
MODS_JSON="$(dirname "$0")/../mods.json"

if [ -z "$JAR" ] || [ -z "$NAME" ]; then
    echo "Usage: $0 <jar-path> <release-name>"
    exit 1
fi

echo "Uploading $NAME..."
gh release upload latest "$JAR#$NAME" --repo $REPO --clobber

echo "Computing hash..."
HASH=$(sha256sum "$JAR" | awk '{print $1}')
echo "Hash: $HASH"

# Update mods.json
node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('$MODS_JSON', 'utf8'));
const mod = data.mods.find(m => m.file === '$NAME');
if (mod) {
    mod.sha256 = '$HASH';
} else {
    data.mods.push({ file: '$NAME', sha256: '$HASH' });
}
fs.writeFileSync('$MODS_JSON', JSON.stringify(data, null, 2) + '\n');
console.log('mods.json updated.');
"

echo "Uploading mods.json..."
gh release upload latest "$MODS_JSON" --repo $REPO --clobber
echo "Done."

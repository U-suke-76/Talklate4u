const fs = require('fs');
const pngToIcoModule = require('png-to-ico');
const { Jimp } = require('jimp');

const pngToIco = pngToIcoModule.default || pngToIcoModule;

const inputFile = 'assets/icon.png';
const cleanFile = 'assets/icon_clean.png';
const outputFile = 'assets/icon.ico';

async function convert() {
  try {
    console.log(`Reading ${inputFile} with Jimp...`);
    const image = await Jimp.read(inputFile);

    console.log(`Writing cleaned PNG to ${cleanFile}...`);
    await image.write(cleanFile);

    console.log(`Converting ${cleanFile} to ${outputFile}...`);
    const buf = await pngToIco(cleanFile);

    fs.writeFileSync(outputFile, buf);
    console.log('Conversion successful!');

    // Cleanup
    fs.unlinkSync(cleanFile);
  } catch (error) {
    console.error('Error converting icon:', error);
    process.exit(1);
  }
}

convert();

/* eslint-disable no-await-in-loop */
const JSZip = require("jszip");
const xml2js = require("xml2js");
const fs = require("fs").promises;
const path = require("path");
const del = require("del");
const { Semaphore } = require("await-semaphore");

const inputDir = "./input";
const outputDir = "./output";
const comicInfoFileName = "ComicInfo.xml";

/**
 * @param {any} info
 * @param {string} chapterPath
 * @param {string} chapterName
 * @returns {Buffer}
 */
async function packageChapter(info, chapterPath, chapterName) {
	info.ComicInfo.Title[0] = chapterName;
	info.ComicInfo.PageCount[0] = (5).toString();

	let cbz = new JSZip();
	cbz.file("ComicInfo.xml", new xml2js.Builder().buildObject(info));

	let source = await JSZip.loadAsync(await fs.readFile(chapterPath));

	source.forEach((path, zipObject) => {
		if (zipObject.dir) return;
		cbz.file(zipObject.name, zipObject.async("nodebuffer"));
	});

	return await cbz.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/**
 * @param {string} seriesPath
 */
async function packageSeries(seriesPath) {
	let seriesName = path.basename(seriesPath);
	console.log(`${seriesName} {`);

	let infoFile = await fs.readFile(`${seriesPath}/${comicInfoFileName}`);
	let info = await xml2js.parseStringPromise(infoFile.toString());

	delete info.ComicInfo.Pages;
	info.ComicInfo.Series[0] = seriesName;

	let outputName = `${outputDir}/${seriesName}`;
	await fs.mkdir(outputName);

	let semaphore = new Semaphore(5);

	let chapters = await fs.readdir(seriesPath);
	let promises = chapters.map(async chapterFile => {
		if (chapterFile == comicInfoFileName) return;
		await semaphore.use(async () => {
			let chapterName = path.basename(`./${chapterFile}`, ".zip");
			let zip = await packageChapter(info, `${seriesPath}/${chapterFile}`, chapterName);
			await fs.writeFile(`${outputName}/${seriesName} - ${chapterName}.cbz`, zip);
			console.log(`  ${chapterName}`);
		});
	});

	await Promise.all(promises);
	console.log("}");
}

async function packageAll() {
	await del(`${outputDir}/**/*`);

	for (let series of await fs.readdir(inputDir)) {
		await packageSeries(`${inputDir}/${series}`);
	}
}

packageAll();

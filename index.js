const discord = require('discord.js');
const bot = new discord.Client();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const discordApi = process.env.DISCORD_API;
const channel = process.env.CHANNEL;
const errorLog = process.env.ERROR_CHANNEL;
const tagUser = process.env.TAG_USER;
const url = process.env.URL;
const urlList = url.split(";");
const stores = process.env.STORES;
const storesToCheck = stores.split(";");

const createEmbed = (name, url, stores) => {
	const inventoryFields = []

	stores.forEach(el => {
		inventoryFields.push({
			name: el.store,
			value: el.inventory,
			inline: true
		});
	});

	return {
		embed: {
			title: name,
			url,
			fields: inventoryFields,
			timestamp: new Date()
		}
	}
}

const urlListEmbed = urls => {
	let fields = [];

	urlList.forEach((url, i) => {
		fields.push({
			name: `URL ${i + 1}`,
			value: url
		});
	});

	return fields;
}

bot.login(discordApi);
bot.on('ready', () => {
	console.info("Logged into Discord!");
	// bot.channels.cache.get(channel).send({
	// 	embed: {
	// 		title: "Checking pages!",
	// 		fields: urlListEmbed(urlList),
	// 		timestamp: new Date()
	// 	}
	// });
});

puppeteer.launch({
	args: ['--no-sandbox'],
	headless: true,
	// executablePath: 'chromium-browser'
})
.then(async browser => {
	const page = await browser.newPage();
	const context = browser.defaultBrowserContext();
	await context.overridePermissions(url, ['geolocation'])
	await page.setGeolocation({latitude: 41.308273, longitude: -72.927879})

	for(let url of urlList) {
		try {
			console.log(`Going to ${url}`);
			await page.goto(url);
			console.log(`Successfully navigated to ${url}`);
			await page.waitForSelector("#usdh-availability-cash-and-carry-section");

			await page.evaluate(() => {
				const storeListOpen = Array.from(document.querySelectorAll('a')).find(el => el.innerText === "check other IKEA stores");
				storeListOpen.click();
			});

			await page.waitForSelector("div.usdh-availability-modal-body");
			await page.waitForSelector("div.usdh-availability-store-search");

			result = await page.evaluate(storesToCheck => {
				const productTitle = document.querySelector("span.pip-header-section__title--big").innerText + " ";
				const productDesc = document.querySelector("span.pip-header-section__description-text").innerText;
				const product = {
					product: productTitle + productDesc,
					url: window.location.href,
					stores: []
				}
				let storesChecked = [];
				const storeList = document.querySelectorAll("div.usdh-availability-store-information-card");

				for(store of storeList) {
					if(store.querySelector("h3 span")) {
						console.log(store);
						const storeName = store.querySelector("h3 span").innerText;
						const storeInventory = store.querySelector("span").innerText;
						if(storesToCheck.includes(storeName)) {
							product.stores.push({
								store: storeName,
								inventory: storeInventory
							});
						}
					}

					if(storesChecked.length === storesToCheck.length) {
						break;
					}
				}

				return product;
			}, storesToCheck);

			console.log(result);

			for(let store of result.stores) {
				if(store.inventory != "Out of stock" && store.inventory != "Not available at this location") {
					bot.channels.cache.get(channel).send(createEmbed(result.product, result.url, result.stores));
					break;
				}
			}
		} catch(err) {
			console.error(err);
			// bot.channels.cache.get(errorLog).send(err);
		}
	}

	await browser.close();
});

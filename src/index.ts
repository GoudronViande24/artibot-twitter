import Artibot, { Global, Module, log } from "artibot";
import Localizer from "artibot-localizer";
import { TwitterApi, ETwitterStreamEvent, StreamingV2AddRulesParams, StreamingV2DeleteRulesParams } from "twitter-api-v2";
import { ChannelType, GuildTextBasedChannel, roleMention, EmbedBuilder, ColorResolvable, MessageCreateOptions } from "discord.js";

import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

interface ArtibotTwitterConfig {
	users: string[];
	token?: string
	channel: string;
	everyone: boolean;
	role?: string;
	banner?: string;
}

export class ArtibotTwitterConfigBuilder implements ArtibotTwitterConfig {
	users: string[] = [];
	token?: string;
	channel: string = "twitter";
	everyone: boolean = false;
	role?: string;
	banner?: string;

	/** Add a twitter username */
	addUser(username: string): this {
		if (username.startsWith("@")) username = username.replace("@", "");
		this.users.push(username);
		return this;
	}

	/** Add multiple twitter usernames */
	addUsers(...usernames: string[] | string[][]): this {
		for (const username of usernames) {
			if (Array.isArray(username)) this.addUsers(...username);
			else this.addUser(username);
		}
		return this;
	}

	/** Set the authentication token for Twitter API */
	setToken(token: string): this {
		this.token = token;
		return this;
	}

	/** Set the channel name where to send notifications */
	setChannel(channel: string): this {
		this.channel = channel;
		return this;
	}

	/** Tag everyone when a new tweet is posted? */
	tagEveryone(value: boolean = true): this {
		this.everyone = value;
		return this;
	}

	/** Set the role name to ping when a new tweet is posted */
	setRole(roleName: string): this {
		this.role = roleName;
		return this;
	}

	/** Set the banner image URL */
	setBanner(bannerURL: string): this {
		this.banner = bannerURL;
		return this;
	}
}

let config: ArtibotTwitterConfig;
let twitter: TwitterApi;

const localizer: Localizer = new Localizer({
	filePath: path.join(__dirname, "..", "locales.json")
});

export default function artibotTwitter({ config: { lang } }: Artibot, twitterConfig: ArtibotTwitterConfig): Module {
	localizer.setLocale(lang);
	config = twitterConfig;
	if (!config.token) throw new Error(localizer._("No token provided for Twitter API"));
	twitter = new TwitterApi(config.token);

	return new Module({
		id: "twitter",
		name: "Twitter",
		version,
		langs: ["fr", "en"],
		repo: "GoudronViande24/artibot-twitter",
		packageName: "artibot-twitter",
		parts: [
			new Global({
				id: "twitter",
				mainFunction
			})
		]
	});
}

async function mainFunction({ client, config: { embedColor }, createEmbed }: Artibot): Promise<void> {
	const add: StreamingV2AddRulesParams["add"] = [];
	const toDelete: StreamingV2DeleteRulesParams["delete"] = { ids: [] };
	for (const user of config.users) {
		add.push({ value: "from:" + user, tag: user });
	}

	while (true) {
		try {
			const activeRules = await twitter.v2.streamRules();
			if (activeRules.data) for (const { id } of activeRules.data) toDelete.ids.push(id);

			if (toDelete.ids.length) await twitter.v2.updateStreamRules({ delete: toDelete });
			await twitter.v2.updateStreamRules({ add });

			for (const user of config.users) log("Twitter", localizer.__("Following [[0]]", { placeholders: [user] }), "log");

			const stream = await twitter.v2.searchStream({
				expansions: "author_id,attachments.media_keys",
				"user.fields": "profile_image_url",
				"media.fields": "url"
			});

			stream.on(ETwitterStreamEvent.Data, async tweet => {
				if (!tweet.includes || !tweet.includes.users || !tweet.includes.users[0]) return;
				log("Twitter", localizer.__("New tweet by [[0]]", { placeholders: [tweet.includes.users[0].name] }), "info");
				for (const [, guild] of client!.guilds.cache) {
					const channel = guild.channels.cache.find(channel =>
						channel.type == ChannelType.GuildText && channel.name.toLowerCase() == config.channel.toLowerCase()
					) as GuildTextBasedChannel;

					if (!channel) {
						log("Twitter", localizer.__("No channel named [[0]] found in guild [[1]]", { placeholders: [config.channel, guild.name] }));
						continue;
					}

					let tag: string | undefined;
					if (config.everyone) {
						tag = "@everyone ";
					} else if (config.role) {
						const role = guild.roles.cache.find(role => role.name.toLowerCase() == config.role!.toLowerCase());
						if (role) tag = roleMention(role.id) + " ";
					}

					try {
						const message: MessageCreateOptions = { embeds: [] };
						const embed: EmbedBuilder = createEmbed()
							.setTitle(localizer._("New Tweet"))
							.setAuthor({
								name: `${tweet.includes.users[0].name} (${tweet.includes.users[0].username})`,
								iconURL: tweet.includes.users[0].profile_image_url,
								url: "https://twitter.com/" + tweet.includes.users[0].username
							})
							.setURL(`https://twitter.com/${tweet.includes.users[0].username}/status/${tweet.data.id}`);
						if (tweet.data.text) embed.setDescription(tweet.data.text);
						const image = tweet.includes?.media?.find(media => media.type == "photo" || media.type == "animated_gif");
						if (image) embed.setImage(image.url!);
						message.embeds!.push(embed);

						if (config.banner) message.embeds!.push(new EmbedBuilder()
							.setImage(config.banner)
							.setColor(embedColor)
						);

						if (tag) message.content = tag;
						await channel.send(message);
						log("Twitter", localizer.__("Sent notification to [[0]] in channel [[1]]", { placeholders: [guild.name, channel.name] }));
					} catch (e) {
						log("Twitter", localizer.__("Impossible to send embed to [[0]]", { placeholders: [guild.name] }));
						log("Twitter", (e as Error).message, "debug");
					}
				}
			});
			log("Twitter", localizer._("Connected to Twitter and listening for new tweets"), "info");
			break;
		} catch (e) {
			log("Twitter", localizer._("error detected, restarting..."), "warn");
			log("Twitter", (e as Error).message, "debug");
			continue;
		}
	}
}
import Artibot, { Global, Module } from "artibot";
import Localizer from "artibot-localizer";
import { TwitterApi, ETwitterStreamEvent, StreamingV2AddRulesParams, StreamingV2DeleteRulesParams } from "twitter-api-v2";
import { ChannelType, GuildTextBasedChannel, roleMention } from "discord.js";

import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

interface ArtibotTwitterConfig {
	users: string[];
	token: string
	channel: string;
	everyone: boolean;
	role?: string;
}

export class ArtibotTwitterConfigBuilder implements ArtibotTwitterConfig {
	users: string[] = [];
	token: string;
	channel: string = "twitter";
	everyone: boolean = false;
	role?: string;

	/** Add a twitter username */
	addUser(username: string): ArtibotTwitterConfigBuilder {
		if (username.startsWith("@")) username = username.replace("@", "");
		this.users.push(username);
		return this;
	}

	/** Add multiple twitter usernames */
	addUsers(usernames: string[]): ArtibotTwitterConfigBuilder {
		for (const username of usernames) this.addUser(username);
		return this;
	}

	/** Set the authentication token for Twitter API */
	setToken(token: string): ArtibotTwitterConfigBuilder {
		this.token = token;
		return this;
	}

	/** Set the channel name where to send notifications */
	setChannel(channel: string): ArtibotTwitterConfigBuilder {
		this.channel = channel;
		return this;
	}

	/** Tag everyone when a new tweet is posted? */
	tagEveryone(value: boolean = true): ArtibotTwitterConfigBuilder {
		this.everyone = value;
		return this;
	}

	/** Set the role name to ping when a new tweet is posted */
	setRole(roleName: string): ArtibotTwitterConfigBuilder {
		this.role = roleName;
		return this;
	}
}

export default function artibotReseauDiscord({ config: { lang } }: Artibot, cfg: Object): Module {
	config = cfg as ArtibotTwitterConfig;
	localizer.setLocale(lang);
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

let config: ArtibotTwitterConfig;
let twitter: TwitterApi;

const localizer: Localizer = new Localizer({
	filePath: path.join(__dirname, "..", "locales.json")
});

async function mainFunction({ log, createEmbed, client }: Artibot): Promise<void> {
	const add: StreamingV2AddRulesParams["add"] = [];
	const toDelete: StreamingV2DeleteRulesParams["delete"] = { ids: [] };
	for (const user of config.users) {
		add.push({ value: "from:" + user, tag: user });
	}

	while (true) {
		try {
			const activeRules = await twitter.v2.streamRules();
			for (const { id } of activeRules.data) toDelete.ids.push(id);

			await twitter.v2.updateStreamRules({ delete: toDelete });
			await twitter.v2.updateStreamRules({ add });

			for (const user of config.users) log("Twitter", localizer.__("Following [[0]]", { placeholders: [user] }), "log");

			const stream = await twitter.v2.searchStream({
				expansions: "author_id"
			});

			stream.on(ETwitterStreamEvent.Data, tweet => {
				log("Twitter", localizer.__("New tweet by [[0]]", { placeholders: [tweet.includes.users[0].name] }), "info");
				for (const [, guild] of client.guilds.cache) {
					const channel = guild.channels.cache.find(channel =>
						channel.type == ChannelType.GuildText && channel.name.toLowerCase() == config.channel.toLowerCase()
					) as GuildTextBasedChannel;

					if (!channel) {
						log("Twitter", localizer.__("No channel named [[0]] found in guild [[1]]", { placeholders: [config.channel, guild.name] }));
						continue;
					}

					let tag: string = "";
					if (config.everyone) {
						tag = "@everyone ";
					} else if (config.role) {
						const role = guild.roles.cache.find(role => role.name.toLowerCase() == config.role.toLowerCase());
						if (role) tag = roleMention(role.id) + " ";
					}

					try {
						channel.send(
							`${tag}**${localizer.__("New tweet by [[0]]", { placeholders: [tweet.includes.users[0].name] })}**\n${localizer._("View here: ")}https://twitter.com/${tweet.includes.users[0].username}/status/${tweet.data.id}`
						);
						log("Twitter", localizer.__("Sent notification to [[0]] in channel [[1]]", { placeholders: [guild.name, channel.name] }));
					} catch (e) {
						log("Twitter", localizer.__("Impossible to send embed to [[0]]", { placeholders: [guild.name] }));
						log("Twitter", e, "debug");
					}
				}
			});
			log("Twitter", localizer._("Connected to Twitter and listening for new tweets"), "info");
			break;
		} catch (e) {
			log("Twitter", localizer._("error detected, restarting..."), "warn");
			log("Twitter", e, "debug");
			continue;
		}
	}
}
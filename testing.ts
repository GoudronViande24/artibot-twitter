import Artibot from "artibot";
import artibotTwitter, { ArtibotTwitterConfigBuilder } from "./src/index.js";
import { TWITTER_TOKEN, DISCORD_TOKEN } from "./private.js";

const artibot = new Artibot({
	ownerId: "382869186042658818",
	botName: "Artibot [DEV]",
	prefix: "abd ",
	lang: "fr",
	testGuildId: "775798875356397608",
	debug: true
});

artibot.registerModule(artibotTwitter, new ArtibotTwitterConfigBuilder()
	.addUser("GoudronViande24")
	.setToken(TWITTER_TOKEN)
);

artibot.login({ token: DISCORD_TOKEN });
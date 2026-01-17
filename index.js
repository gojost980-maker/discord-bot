// ---------- IMPORTS ----------
const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder } = require("discord.js");
const fs = require("fs");

// ---------- CLIENT ----------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// ---------- CONFIG ----------
const PREFIX = ",";
const JAIL_ROLE_NAME = "Jail";
const JAIL_LOG_CHANNEL = "jail-logs";
const STATS_FILE = "./stats.json";
const JAIL_DATA_FILE = "./jailData.json";
const MESSAGE_STATS_FILE = "./messageStats.json";
const WARNINGS_FILE = "./warnings.json";
const AFK_FILE = "./afk.json";

// ---------- UTILITIES ----------
function load(file, def = {}) { if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(def, null, 2)); return JSON.parse(fs.readFileSync(file)); }
function save(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
async function fetchMember(message, id) { 
    let member = message.mentions.members.first() || message.guild.members.cache.get(id);
    if (!member && id) {
        try { member = await message.guild.members.fetch(id); } catch { return null; }
    }
    return member;
}
function addStat(userId, type) {
  const stats = load(STATS_FILE);
  if (!stats[userId]) stats[userId] = { mute:0, unmute:0, jail:0, unjail:0 };
  stats[userId][type]++;
  save(STATS_FILE, stats);
}

// ---------- MESSAGE COUNT ----------
client.on("messageCreate", message => {
    if (message.author.bot) return;
    const stats = load(MESSAGE_STATS_FILE);
    stats[message.author.id] = (stats[message.author.id] || 0) + 1;
    save(MESSAGE_STATS_FILE, stats);
});

// ---------- READY ----------
client.once("ready", () => console.log(`Logged in as ${client.user.tag}`));

// ---------- COMMAND HANDLER ----------
client.on("messageCreate", async message => {
  if (message.author.bot) return;

  const afkData = load(AFK_FILE);

  // ---------- REMOVE AFK ----------
  if (afkData[message.author.id]) {
    delete afkData[message.author.id];
    save(AFK_FILE, afkData);
    message.reply({ embeds:[new EmbedBuilder().setColor("Green").setDescription("👋 Welcome back! AFK removed.").setTimestamp()] });
  }

  // ---------- AFK MENTION ----------
  message.mentions.users.forEach(user => {
    if (afkData[user.id]) {
      message.reply({ embeds:[new EmbedBuilder().setColor("Grey").setDescription(`💤 ${user.username} is AFK: ${afkData[user.id]}`).setTimestamp()] });
    }
  });

  // ---------- t,m ----------
  if (message.content.toLowerCase() === "t,m") {
    const stats = load(MESSAGE_STATS_FILE);
    const count = stats[message.author.id] || 0;
    return message.reply({ embeds:[new EmbedBuilder().setColor("Yellow").setTitle("🌞 Good Morning").setDescription(`You have sent **${count} messages** in this server.`).setFooter({ text: message.author.username, iconURL: message.author.displayAvatarURL() }).setTimestamp()] });
  }

  if (!message.content.startsWith(PREFIX)) return;
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // ---------- STAFF CHECK ----------
  const staffOnly = ["mute","unmute","jail","unjail","warn","warnings","ms"];
  if (staffOnly.includes(command)) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return message.reply({ embeds:[new EmbedBuilder().setColor("Red").setDescription("❌ You need staff permissions to use this command.").setTimestamp()] });
    }
  }

  // ---------- AFK ----------
  if (command === "afk") {
    const reason = args.join(" ") || "AFK";
    afkData[message.author.id] = reason;
    save(AFK_FILE, afkData);
    return message.reply({ embeds:[new EmbedBuilder().setColor("Grey").setTitle("💤 AFK Enabled").setDescription(reason).setTimestamp()] });
  }

  // ---------- MUTE ----------
  if (command === "mute") {
    const member = await fetchMember(message, args[0]);
    const timeArg = args[1];
    const reason = args.slice(2).join(" ") || "No reason provided";

    if (!member || !timeArg) return message.reply({ embeds:[new EmbedBuilder().setColor("Red").setDescription("Usage: ,mute <@user | ID> 10m [reason]").setTimestamp()] });
    if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return message.reply({ embeds:[new EmbedBuilder().setColor("Red").setDescription("❌ I need Moderate Members permission.").setTimestamp()] });
    if (member.roles.highest.position >= message.member.roles.highest.position) return message.reply({ embeds:[new EmbedBuilder().setColor("Red").setDescription("❌ You can't mute this user.").setTimestamp()] });

    const time = parseInt(timeArg);
    const unit = timeArg.slice(-1);
    const ms = unit === "m"?time*60000:unit==="h"?time*3600000:null;
    if (!ms) return message.reply({ embeds:[new EmbedBuilder().setColor("Red").setDescription("❌ Use 10m or 1h format.").setTimestamp()] });

    try {
      await member.timeout(ms, reason);
      addStat(message.author.id,"mute");
      message.reply({ embeds:[new EmbedBuilder().setColor("Red").setTitle("🔇 User Muted").addFields(
        { name:"User", value:member.user.tag },
        { name:"Duration", value:timeArg },
        { name:"Reason", value:reason }
      ).setFooter({ text:`Moderator: ${message.author.tag}` }).setTimestamp()] });
    } catch { message.reply({ embeds:[new EmbedBuilder().setColor("Red").setDescription("❌ I can't mute this user.").setTimestamp()] }); }
  }

  // ---------- UNMUTE ----------
  if (command === "unmute") {
    const member = await fetchMember(message, args[0]);
    if (!member) return message.reply({ embeds:[new EmbedBuilder().setColor("Red").setDescription("Usage: ,unmute <@user | ID>").setTimestamp()] });
    try {
      await member.timeout(null);
      addStat(message.author.id,"unmute");
      message.reply({ embeds:[new EmbedBuilder().setColor("Green").setTitle("🔊 User Unmuted").setDescription(member.user.tag).setFooter({ text:`Moderator: ${message.author.tag}` }).setTimestamp()] });
    } catch { message.reply({ embeds:[new EmbedBuilder().setColor("Red").setDescription("❌ I can't unmute this user.").setTimestamp()] }); }
  }

  // ---------- WARN ----------
  if (command === "warn") {
    const member = await fetchMember(message, args[0]);
    if (!member) return message.reply({ embeds:[new EmbedBuilder().setColor("Red").setDescription("❌ Could not find a user with that ID.").setTimestamp()] });
    const reason = args.slice(1).join(" ") || "No reason provided";
    const warnings = load(WARNINGS_FILE); if(!warnings[member.id]) warnings[member.id]=[];
    warnings[member.id].push({ reason, mod: message.author.id, date: new Date().toISOString() });
    save(WARNINGS_FILE, warnings);
    message.reply({ embeds:[new EmbedBuilder().setColor("Orange").setTitle("⚠️ Warning Issued").addFields(
      { name:"User", value:member.user.tag },
      { name:"Reason", value:reason }
    ).setFooter({ text:`Moderator: ${message.author.tag}` }).setTimestamp()] });
  }

  // ---------- WARNINGS ----------
  if (command === "warnings") {
    const member = await fetchMember(message, args[0]) || message.member;
    const warnings = (load(WARNINGS_FILE)[member.id] || []);
    if(!warnings.length) return message.reply({ embeds:[new EmbedBuilder().setColor("Green").setDescription(`${member.user.tag} has no warnings.`).setTimestamp()] });
    message.reply({ embeds:[new EmbedBuilder().setColor("Orange").setTitle(`⚠️ Warnings for ${member.user.tag}`).setDescription(warnings.map((w,i)=>`${i+1}. ${w.reason} — by <@${w.mod}> on ${new Date(w.date).toLocaleDateString()}`).join("\n")).setTimestamp()] });
  }

    // ---------- JAIL ----------
  if (command === "jail") {
    const member = message.mentions.members.first();
    if (!member) return message.reply("Mention a user.");

    const jailRole = message.guild.roles.cache.find(r => r.name === JAIL_ROLE_NAME);
    if (!jailRole) return message.reply("Jail role not found.");

    const jailData = load(JAIL_DATA_FILE);
    jailData[member.id] = member.roles
    await member.roles.set([jailRole]);
    message.reply(`⛓️ Jailed ${member.user.tag}`);

    const log = message.guild.channels.cache.find(c => c.name === JAIL_LOG_CHANNEL);
    if (log) log.send(`⛓️ **JAIL**\nUser: ${member.user.tag}\nMod: ${message.author.tag}`);
  }

    // ---------- UNJAIL ----------
  if (command === "unjail") {
    const member = message.mentions.members.first();
    if (!member) return message.reply("Mention a user.");

    const jailData = load(JAIL_DATA_FILE);
    if (!jailData[member.id]) return message.reply("User not jailed.");

    await member.roles.set(jailData[member.id]);
    delete jailData[member.id];
    save(JAIL_DATA_FILE, jailData);

    message.reply(`🔓 Unjailed ${member.user.tag}`);

    const log = message.guild.channels.cache.find(c => c.name === JAIL_LOG_CHANNEL);
    if (log) log.send(`🔓 **UNJAIL**\nUser: ${member.user.tag}\nMod: ${message.author.tag}`);
  }

  // ---------- MOD STATS ----------
  if (command === "ms") {
    const target = await fetchMember(message, args[0]) || message.member;
    const stats = load(STATS_FILE)[target.id] || { mute:0, unmute:0, jail:0, unjail:0 };
    const warnings = (load(WARNINGS_FILE)[target.id]||[]).length;
    const total = stats.mute + stats.jail + warnings;
    const embed = new EmbedBuilder().setColor("Blue").setTitle(`📊 Moderation Stats — ${target.user.tag}`).addFields(
      {name:"Mutes",value:`${stats.mute}`,inline:true},
      {name:"Jails",value:`${stats.jail}`,inline:true},
      {name:"Warnings",value:`${warnings}`,inline:true},
      {name:"Total Actions",value:`${total}`,inline:true}
    ).setTimestamp();
    message.reply({ embeds:[embed] });
  }

});

// ---------- LOGIN ----------
client.login(process.env.TOKEN);


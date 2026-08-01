{js:{ignore:
(async () => {
try {

const questsURL =
  "https://raw.githubusercontent.com/xGustavvo/discord-api-tracker/refs/heads/main/data/quests-01.json";

const fallbackQuestURL =
  "https://raw.githubusercontent.com/xGustavvo/discord-api-tracker/refs/heads/main/quest.json";

const [res, fallbackRes] = await Promise.all([
  fetch(questsURL),
  fetch(fallbackQuestURL)
]);

const resRestrictions = await fetch(
  "https://gist.githubusercontent.com/xGustavvo/3d08b7369eb34b50834815fd43176cae/raw"
);

const restrictionsData = await resRestrictions.json();

const mainData = await res.json();
const fallbackData = await fallbackRes.json();

if (!Array.isArray(mainData))
  return "❌ Invalid main quest structure.";

const restrictions = restrictionsData.quests || [];

const restrictionsMap =
  new Map(restrictions.map(q => [q.id, q]));

const normalizeQuest = q => {

  if(q.config){
    return q;
  }

  return {
    id: q.id,

    config: {
      starts_at: q.starts_at,
      expires_at: q.expires_at,

      messages: {
        quest_name:
          q.messages?.quest_name ||
          q.messages?.game_title ||
          "Unknown Quest"
      },

      task_config_v2: q.task_config_v2,

      rewards_config: q.rewards_config
    }
  };

};

const dataMap = new Map();

for(const q of mainData){
  dataMap.set(q.id, normalizeQuest(q));
}

if(Array.isArray(fallbackData)){

  for(const q of fallbackData){

    if(!dataMap.has(q.id)){
      dataMap.set(q.id, normalizeQuest(q));
    }

  }

}

const data = [...dataMap.values()];

let input = Array.isArray(args)
  ? args.join(" ").trim()
  : (args || "").trim();

const now = Date.now();

const parts = message.content.trim().split(/\s+/);

const cmd =
  `${parts[0]} ${parts[1] || ""}`.trim();

const testQuestIds = [
  "1193992107035983872",
  "1417206015245418566",
  "1223393873447878656",
  "1276640451235156082",
  "1483951358322147380",
  "1519474065293967471"
];

const taskMap = {
  WATCH_VIDEO: "Video",
  WATCH_VIDEO_ON_MOBILE: "Mobile (Video)",
  PLAY_ON_DESKTOP: "Desktop",
  PLAY_ON_XBOX: "Xbox",
  PLAY_ON_PLAYSTATION: "PlayStation",
  PLAY_ACTIVITY: "Activity",
  STREAM_ON_DESKTOP: "Desktop (Stream)",
  win: "Win"
};

/* helpers */

const toTimestamp = iso => {
  const t = Date.parse(iso);
  return isNaN(t)
    ? "?"
    : `<t:${Math.floor(t / 1000)}:R>`;
};

const getRewards = q =>
  q.config?.rewards_config?.rewards ||
  q.config?.rewards ||
  [];

const getTasks = cfg =>
  cfg?.task_config_v2?.tasks ||
  cfg?.task_config?.tasks ||
  {};

const taskName = t => {

  let type = t.type || t.event_name;

  if(type === "ACHIEVEMENT_IN_ACTIVITY")
    return "Achievement (Activity)";

  if(type === "ACHIEVEMENT_IN_GAME")
    return "Achievement (Game)";

  return taskMap[type] || type || "None";

};

/* regions v2 */

const normalizeRegions = (regions) => {

  if (Array.isArray(regions)) {
    return {
      type: "include",
      list: regions
    };
  }

  if (regions && typeof regions === "object") {
    return {
      type: "advanced",
      include: regions.include || [],
      exclude: regions.exclude || []
    };
  }

  return null;
};

const isRegionAllowed = (regions, userRegion) => {

  if (!regions) return true;

  const include = regions.include || [];
  const exclude = regions.exclude || [];

  // blacklist pura
  if (include.length === 0 && exclude.length > 0) {
    return !exclude.includes(userRegion);
  }

  // whitelist
  if (include.length > 0) {
    return include.includes(userRegion);
  }

  // global
  return true;
};

/* flags */

const flags = input.split(/\s+/);

const showExpired = flags.includes("-e");
const showExpiring = flags.includes("-expiring");
const showOrbsOnly = flags.includes("-orbs");
const showLinked = flags.includes("-linked");
const showRestricted = flags.includes("-res");
const showRegions = flags.includes("-regions");
const showAge = flags.includes("-age");
const showAllStats = flags.includes("-all");

input = input
  .replace("-e", "")
  .replace("-expiring", "")
  .replace("-orbs", "")
  .replace("-linked", "")
  .replace("-res", "")
  .replace("-regions","")
  .replace("-age","")
  .replace("-all", "")
  .trim();

/* pagination */

let page = 1;

const pageMatch =
  input.match(/-(\d+)$/);

if(pageMatch){

  page = Math.max(
    1,
    parseInt(pageMatch[1], 10)
  );

  input = input
    .replace(pageMatch[0], "")
    .trim();

}

/* help */

if(input === "help"){

  return [
    "**Quest Command Help**",
    `\`${cmd}\` → Show all active quests`,
    `\`${cmd} <quest_id>\` → Search by ID`,
    `\`${cmd} -n <name>\` → Search quests by name (includes expired)`,
    `\`${cmd} -r <reward>\` → Search quests by reward`,
    `\`${cmd} -<page>\` → Show a specific page (e.g., \`-2\`, \`-3\`)`,
    `\`${cmd} -l\` → Show latest quests`,
    `\`${cmd} -e\` → Include expired quests`,
    `\`${cmd} -expiring\` → Sort quests by expiration date`,
    `\`${cmd} -d MM/YY\` → Show quests started in a specific month/year`,
    `\`${cmd} -linked\` → Show quests linked to another quest (only one can be completed)`,
    `\`${cmd} -res\` → Show only restricted quests`,
    `\`${cmd} -regions\` → Show quests with regional restrictions`,
    `\`${cmd} -age\` → Show quests with age restrictions`,
    `\`${cmd} -orbs\` → Show orb quest statistics`,
    `\`${cmd} -all\` → Show quest statistics`
  ].join("\n");

}

/* ALL STATS */

if(showAllStats){

  let total = 0;
  let active = 0;

  let typeCounts = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0
  };

  const uniqueRewards = {
    1: new Set(),
    2: new Set(),
    3: new Set(),
    4: new Set(),
    5: new Set()
  };

  let totalOrbs = 0;

  const taskCount = {};

  for(const q of data){

    const cfg = q.config;

    if(!cfg || testQuestIds.includes(q.id))
      continue;

    total++;

    if(Date.parse(cfg?.expires_at || 0) > now)
      active++;

    const rewards = getRewards(q);

    const missionTypes = new Set();

    for(const r of rewards){

      const t = r?.type;
      const sku = r?.sku_id;
      const quantity = r?.orb_quantity || 0;

      if(t >= 1 && t <= 5)
        missionTypes.add(t);

      if(t === 4 && quantity > 0)
        totalOrbs += quantity;

      if(t >= 1 && t <= 5 && sku)
        uniqueRewards[t].add(sku);

    }

    for(const t of missionTypes){
      typeCounts[t]++;
    }

    const tasks = getTasks(cfg);

    for(const t of Object.values(tasks)){

      const name = taskName(t);

      taskCount[name] =
        (taskCount[name] || 0) + 1;

    }

  }

  const taskLines = Object.entries(taskCount)
    .sort((a, b) => b[1] - a[1])
    .map(([n, c]) => `- ${n}: **${c} quests**`)
    .join("\n");

  return `<:Icon_Quests:1412859870570348727> **Quest Statistics**
Total Quests: **${total}**
Active Quests: **${active}**

<:Icon_NewRelease:1295158548749353060> **Rewards:**
Orbs: **${typeCounts[4]} quests** (**${totalOrbs} Orbs**)
Avatar Decorations: **${typeCounts[3]} quests** (**${uniqueRewards[3].size} Decorations**)
Nitro: **${typeCounts[5]} quests**
Code: **${typeCounts[1]} quests**
In-Game: **${typeCounts[2]} quests**

<:Icon_Member_Activity_Privacy:1418299361493913620> **Quest Type:**
${taskLines}`;

}

/* ORB STATS */

if(showOrbsOnly){

  const orbQuests = data.filter(q =>
    getRewards(q).some(r => r.orb_quantity) &&
    !testQuestIds.includes(q.id)
  );

  const totalQuests = orbQuests.length;

  const totalOrbs = orbQuests.reduce(
    (sum, q) =>
      sum + (getRewards(q)[0]?.orb_quantity || 0),
    0
  );

  const activeQuests = orbQuests.filter(
    q => Date.parse(q.config?.expires_at) > now
  );

  const activeOrbs = activeQuests.reduce(
    (sum, q) =>
      sum + (getRewards(q)[0]?.orb_quantity || 0),
    0
  );

  const orbGroups = {};

  for(const q of orbQuests){

    const orbs =
      getRewards(q)[0]?.orb_quantity || 0;

    orbGroups[orbs] =
      (orbGroups[orbs] || 0) + 1;

  }

  let statsText = [
    "<a:Orb_Shine:1355721669939040499> **Orbs Quest Statistics:**",
    `Total Quests: ${totalQuests}`,
    `Total Orbs: ${totalOrbs}`,
    "",
    `Active quests now: ${activeQuests.length}`,
    `Orbs available now: ${activeOrbs}`,
    ""
  ];

  for(
    const [orb, count]
    of Object.entries(orbGroups)
      .sort((a, b) => b[0] - a[0])
  ){

    statsText.push(
      `${orb} Orbs: ${count} quest(s)`
    );

  }

  statsText.push(
    `\n<:Box_Info:1279524989539975219> Some quests may have restrictions.`
  );

  return statsText.join("\n");

}

/* FILTERS */

let filtered = data;

if(input.startsWith("-n ")){

  const keyword =
    input.slice(3).toLowerCase();

  filtered = data.filter(q =>
    q.config?.messages?.quest_name
      ?.toLowerCase()
      .includes(keyword) &&
    !testQuestIds.includes(q.id)
  );

}

else if(input.startsWith("-r ")){

  const keyword =
    input.slice(3).toLowerCase();

  filtered = data.filter(q =>
    getRewards(q).some(r =>
      (r.messages?.name || r.name)
        ?.toLowerCase()
        .includes(keyword)
    ) &&
    !testQuestIds.includes(q.id)
  );

}

else if(input.startsWith("-d ")){

  const [month, year] =
    input.slice(3).split("/").map(Number);

  if(!month || !year)
    return "❌ Use format: `-d MM/YY`";

  filtered = data.filter(q => {

    const d =
      new Date(q.config?.starts_at);

    return (
      d.getMonth() + 1 === month &&
      d.getFullYear() === 2000 + year &&
      !testQuestIds.includes(q.id)
    );

  });

}

else if(input === "-l"){

  filtered = [...data]
    .filter(q => !testQuestIds.includes(q.id))
    .sort(
      (a, b) =>
        Date.parse(b.config?.starts_at) -
        Date.parse(a.config?.starts_at)
    );

}

else if(/^\d{18,}$/.test(input)){

  filtered = data.filter(q =>
    q.id === input.trim() &&
    !testQuestIds.includes(q.id)
  );

}

else{

  filtered = data.filter(
    q => !testQuestIds.includes(q.id)
  );

}

/* SORT */

filtered = filtered.sort((a, b) => {

  if (showExpiring) {

    return (
      Date.parse(a.config?.expires_at || 0) -
      Date.parse(b.config?.expires_at || 0)
    );

  }

  return (
    Date.parse(b.config?.starts_at || 0) -
    Date.parse(a.config?.starts_at || 0)
  );

});

/* SHOW RESTRICTED */

if (showRestricted) {
    filtered = filtered.filter(q => {
        let restriction = restrictionsMap.get(q.id);

        if (!restriction) {
            restriction = restrictions.find(
                r => r.replacement_id === q.id
            );
        }

        return !!restriction;
    });
}

if (showRegions) {
    filtered = filtered.filter(q => {
        let restriction = restrictionsMap.get(q.id);

        if (
            (!restriction || !restriction.regions?.length)
        ) {
            restriction = restrictions.find(
                r => r.replacement_id === q.id
            );
        }

        return (
            restriction &&
            Array.isArray(restriction.regions) &&
            restriction.regions.length > 0 &&
            restriction.is_global === false
        );
    });
}

if (showAge) {
    filtered = filtered.filter(q => {
        let restriction = restrictionsMap.get(q.id);

        if (!restriction) {
            restriction = restrictions.find(
                r => r.replacement_id === q.id
            );
        }

        return restriction?.show_age_gate === true;
    });
}

if (showLinked) {
  filtered = filtered.filter(q => {

    const restriction = restrictionsMap.get(q.id);

    return (
      restriction?.replacement_id ||
      restrictions.some(r => r.replacement_id === q.id)
    );

  });
}
/* EXPIRED FILTER */

if(
  !input.startsWith("-n ") &&
  !input.startsWith("-d ") &&
  input !== "-l"
){

  filtered = filtered.filter(q => {

    const exp =
      Date.parse(q.config?.expires_at);

    if(isNaN(exp))
      return false;

    if(!showExpired && exp <= now)
      return false;

    return !testQuestIds.includes(q.id);

  });

}

/* LISTING */

if(!filtered.length)
  return "❌ No quests found.";

const totalCount = filtered.length;

/* RESERVE */

const footerPreview =
  `*( Page 000/000 • Showing 000-000 of ${totalCount} quests )*`;

const FOOTER_RESERVE =
  footerPreview.length + 20;

/* BUILD PAGES */

const pages = [];

let currentPage = [];
let currentText = "";

for(const q of filtered){

  const cfg = q.config;

  const name =
    cfg?.messages?.quest_name ||
    "Unknown name";

  const link =
    `https://discord.com/quests/${q.id}`;

  const start =
    toTimestamp(cfg?.starts_at);

  const end =
    toTimestamp(cfg?.expires_at);

  const reward =
    getRewards(q)[0]?.messages?.name ||
    getRewards(q)[0]?.name ||
    "No reward";

  const tasksObj = getTasks(cfg);

  let taskNames = Object.values(tasksObj)
    .map(taskName)
    .join(" / ");

  if(!taskNames)
    taskNames = "None";

  const isExpired =
    Date.parse(cfg?.expires_at) <= now;

  /* restrictions */

  let restriction =
    restrictionsMap.get(q.id);

  if(
    (!restriction || !restriction.regions?.length)
  ){

    const linkedRestriction =
      restrictions.find(
        r => r.replacement_id === q.id
      );

    if(linkedRestriction){
      restriction = linkedRestriction;
    }

  }

  const ageRestricted =
    restriction?.show_age_gate === true;

  const isLinked =
    restriction?.replacement_id ||
    restrictions.some(
      r => r.replacement_id === q.id
    );

  const regionFlags = {
    AT: ":flag_at:",
    AU: ":flag_au:",
    BE: ":flag_be:",
    BR: ":flag_br:",
    CA: ":flag_ca:",
    CH: ":flag_ch:",
    CN: ":flag_cn:",
    CZ: ":flag_cz:",
    DE: ":flag_de:",
    DK: ":flag_dk:",
    ES: ":flag_es:",
    FI: ":flag_fi:",
    FR: ":flag_fr:",
    HK: ":flag_hk:",
    HU: ":flag_hu:",
    IE: ":flag_ie:",
    IN: ":flag_in:",
    IT: ":flag_it:",
    JP: ":flag_jp:",
    KR: ":flag_kr:",
    MX: ":flag_mx:",
    NL: ":flag_nl:",
    NO: ":flag_no:",
    NZ: ":flag_nz:",
    PL: ":flag_pl:",
    PT: ":flag_pt:",
    SE: ":flag_se:",
    SG: ":flag_sg:",
    SK: ":flag_sk:",
    UK: ":flag_gb:",
    US: ":flag_us:",
    VN: ":flag_vn:"
  };

let regionsLines = [];

const normalizedRegions = normalizeRegions(restriction?.regions);

if (restriction?.is_global === false && normalizedRegions) {

  if (normalizedRegions.type === "include") {
    const list = normalizedRegions.list
      .map(r => regionFlags[r] || r)
      .join(", ");

    regionsLines.push(`Include: ${list}`);
  }

  if (normalizedRegions.type === "advanced") {

    const inc = normalizedRegions.include || [];
    const exc = normalizedRegions.exclude || [];

    if (inc.length) {
      regionsLines.push(
        `Include: ${inc.map(r => regionFlags[r] || r).join(", ")}`
      );
    }

    if (exc.length) {
      regionsLines.push(
        `Exclude: ${exc.map(r => regionFlags[r] || r).join(", ")}`
      );
    }
  }
}

  /* QUEST TEXT */

  const questText =

    (isExpired
      ? `- **${name}**`
      : `- [**${name}**](<${link}>)`) +

    `\nStarts: ${start} | Expires: ${end}` +
    `\nReward: ${reward}` +
    `\nTask(s): ${taskNames}` +

    (ageRestricted
      ? `\nAge Restriction: 🔞`
      : "") +

    (regionsLines.length
      ? `\nRegion(s):\n${regionsLines.join("\n")}`
      : "") +

    (isLinked
      ? `\nLinked: 🔗`
      : "");

  /* PAGE SPLIT */

  if(
    currentPage.length >= 10 ||
    (
      currentText + "\n\n" + questText
    ).length > (2000 - FOOTER_RESERVE)
  ){

    pages.push(currentPage);

    currentPage = [];
    currentText = "";

  }

  currentPage.push({
    text: questText,
    raw: q
  });

  currentText +=
    (currentText ? "\n\n" : "") +
    questText;

}

/* PUSH LAST PAGE */

if(currentPage.length){
  pages.push(currentPage);
}

/* PAGE SELECTION */

const totalPages = pages.length;

if(page > totalPages){

  return `❌ Page ${page} does not exist. Max page: ${totalPages}.`;

}

const pageItems = pages[page - 1];

/* COUNTING */

let shownBefore = 0;

for(let i = 0; i < page - 1; i++){
  shownBefore += pages[i].length;
}

const start = shownBefore + 1;
const end = shownBefore + pageItems.length;

/* FINAL TEXT */

let finalText =
  pageItems.map(p => p.text).join("\n\n");

finalText +=
  `\n\n*( Page ${page}/${totalPages} • Showing ${start}-${end} of ${totalCount} quests )*`;

return finalText;

}catch{

return "❌ Error fetching or processing quests.";

}

})()
}}

/* =========================================================================
   DATA — every piece of content on the site lives here.

   ── WHERE DO I PUT MY PHOTOS? ─────────────────────────────────────────────
   Drop image files into the assets/ folder using these exact paths.
   If a file is missing, the site draws its own artwork instead — so it never
   breaks, and you can add pictures one at a time.

     assets/profile.jpg              500 x 500   (square — your photo/avatar)
     assets/anime/berserk.jpg        600 x 900   (2:3 poster)
     assets/anime/mushoku.jpg        600 x 900
     assets/anime/ponyo.jpg          600 x 900
     assets/anime/nausicaa.jpg       600 x 900
     assets/anime/marnie.jpg         600 x 900
     assets/games/roblox.jpg         600 x 800   (3:4 card)
     assets/games/cs2.jpg            600 x 800
     assets/games/undertale.jpg      600 x 800
     assets/games/deltarune.jpg      600 x 800
     assets/games/mlbb.jpg           600 x 800

   .png and .webp work too — just change the `img` value below to match.
   ========================================================================= */

const SIZES = {
  anime:   { w: 600, h: 900 },   // 2:3
  game:    { w: 600, h: 800 },   // 3:4
  profile: { w: 500, h: 500 }    // 1:1
};

const DATA = {
  identity: {
    name: 'Amirhossein Safaei',
    handle: 'AMIRHOSSEIN',
    suffix: '.dev',
    initials: 'AS',
    age: 17,
    img: 'assets/profile.jpg',          // 500 x 500
    tagline: 'Pro Gamer · Motion Designer · Builder',
    github: 'Amirhossein41148',
    githubUrl: 'https://github.com/Amirhossein41148',
    email: 'amirhossein411484@gmail.com',
    bio: [
      'Veteran gamer since childhood, now competing at a high level across shooters, MOBAs and story-driven RPGs.',
      '4+ years editing video in Adobe Premiere Pro and Photoshop, 1+ year in After Effects — motion graphics, VFX compositing and full project delivery.',
      'Builds software too: Harmonia is a cyberpunk/osu!-styled music player shipping on Linux, Windows and Android.'
    ],
    stats: [
      { label: 'AGE',      value: '17' },
      { label: 'EDITING',  value: '4+ YRS' },
      { label: 'AFTER FX', value: '1+ YR' },
      { label: 'RANK',     value: 'PRO' }
    ]
  },

  skills: [
    { name: 'Premiere Pro',    level: 92 },
    { name: 'Photoshop',       level: 88 },
    { name: 'After Effects',   level: 70 },
    { name: 'Competitive FPS', level: 90 },
    { name: 'Web / Three.js',  level: 62 }
  ],

  /* key    → art function in posters.js (used when img is missing)
     img    → your picture, 600 x 800
     accent → neon colour (number for three.js, css string for the DOM) */
  games: [
    { key:'roblox',    icon:'🟥', name:'ROBLOX',         note:'Building + play, 3+ yrs',
      img:'assets/games/roblox.jpg',    accent:0xff3b3b, css:'#ff3b3b' },
    { key:'cs2',       icon:'🎯', name:'CS2',            note:'Competitive FPS, aim main',
      img:'assets/games/cs2.jpg',       accent:0xffa62e, css:'#ffa62e' },
    { key:'undertale', icon:'💀', name:'UNDERTALE',      note:'Pacifist & genocide runs',
      img:'assets/games/undertale.jpg', accent:0xd8d8ff, css:'#d8d8ff' },
    { key:'deltarune', icon:'🌗', name:'DELTARUNE',      note:'Chapters 1–4, secret bosses',
      img:'assets/games/deltarune.jpg', accent:0x8a5cff, css:'#8a5cff' },
    { key:'mlbb',      icon:'⚔️', name:'MOBILE LEGENDS', note:'MOBA — jungle / roam',
      img:'assets/games/mlbb.jpg',      accent:0x2ee6c5, css:'#2ee6c5' }
  ],

  /* img → your poster, 600 x 900 */
  anime: [
    { key:'berserk',  title:'BERSERK',                sub:'Manga & Anime',
      note:'Chibi Guts — cute take on the Black Swordsman',
      img:'assets/anime/berserk.jpg',  accent:0xff2d55, css:'#ff2d55' },
    { key:'mushoku',  title:'MUSHOKU TENSEI',         sub:'Rudeus — childhood arc',
      note:'Little Rudeus with his staff',
      img:'assets/anime/mushoku.jpg',  accent:0x3da9ff, css:'#3da9ff' },
    { key:'ponyo',    title:'PONYO',                  sub:'Studio Ghibli · 2008',
      note:'Ponyo on the cliff by the sea',
      img:'assets/anime/ponyo.jpg',    accent:0xff5c8a, css:'#ff5c8a' },
    { key:'nausicaa', title:'NAUSICAÄ',               sub:'Valley of the Wind · 1984',
      note:'Glider, ohmu and golden sky',
      img:'assets/anime/nausicaa.jpg', accent:0xffc42e, css:'#ffc42e' },
    { key:'marnie',   title:'WHEN MARNIE WAS THERE',  sub:'Studio Ghibli · 2014',
      note:'The marsh house under the moon',
      img:'assets/anime/marnie.jpg',   accent:0x8ad7ff, css:'#8ad7ff' }
  ],

  projects: [
    {
      name: 'HARMONIA',
      version: 'v3.0.0',
      desc: 'A single-file music player with a cyberpunk + osu! inspired interface. Playlists, keyboard-driven navigation and a reactive visualiser.',
      platforms: ['Linux', 'Windows', 'Android'],
      url: 'https://github.com/Amirhossein41148/Harmonia',
      accent: '#00f5ff'
    }
  ],

  contact: [
    { icon:'⌘', label:'GITHUB', value:'Amirhossein41148',
      href:'https://github.com/Amirhossein41148' },
    { icon:'✉', label:'EMAIL',  value:'amirhossein411484@gmail.com',
      href:'mailto:amirhossein411484@gmail.com' }
  ],

  /* Zones you can walk to. x/z are world coords, radius = auto-open distance.
     gallery: 'anime' | 'games' | null — which card ring stands here. */
  nodes: [
    { id:'about',    label:'ABOUT',    x:  0, z:-16, colour:0x00f5ff, radius:5, gallery:null    },
    { id:'games',    label:'GAMES',    x: 24, z: -2, colour:0xff006e, radius:6, gallery:'games' },
    { id:'anime',    label:'ANIME',    x:  0, z: 24, colour:0xbf00ff, radius:6, gallery:'anime' },
    { id:'projects', label:'PROJECTS', x:-24, z: -2, colour:0xffbe0b, radius:5, gallery:null    },
    { id:'contact',  label:'CONTACT',  x:-16, z: 20, colour:0x00ff9d, radius:5, gallery:null    }
  ]
};

window.DATA = DATA;
window.SIZES = SIZES;

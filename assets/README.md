# Where to put your photos

Drop image files here using these **exact paths and sizes**. If a file is
missing, the site draws its own artwork instead — nothing breaks, and you can
add pictures one at a time.

```
assets/
├── profile.jpg              500 x 500   ← your photo (square)
├── anime/
│   ├── berserk.jpg          600 x 900   ← 2:3 poster
│   ├── mushoku.jpg          600 x 900
│   ├── ponyo.jpg            600 x 900
│   ├── nausicaa.jpg         600 x 900
│   └── marnie.jpg           600 x 900
└── games/
    ├── roblox.jpg           600 x 800   ← 3:4 card
    ├── cs2.jpg              600 x 800
    ├── undertale.jpg        600 x 800
    ├── deltarune.jpg        600 x 800
    └── mlbb.jpg             600 x 800
```

## Rules

- **Sizes are targets, not limits.** A bigger image is fine — it gets
  cover-cropped from the centre to the exact ratio, so nothing stretches.
  Just keep the aspect close (2:3 for anime, 3:4 for games, 1:1 for profile)
  or the crop will cut off more than you expect.
- **.png and .webp work too.** If you use a different extension, update the
  `img:` value for that entry in `js/data.js`.
- **Filenames must match** what's in `js/data.js`. Change one, change both.
- A small `PHOTO` badge appears on the card in the panel when your image loaded
  successfully. No badge means it fell back to the drawn art — check the path
  and the spelling.

## Adding a photo for a new card

1. Save the image here, e.g. `assets/anime/frieren.jpg` at 600 x 900.
2. In `js/data.js`, add to `DATA.anime`:

```js
{ key:'frieren', title:'FRIEREN', sub:'Beyond Journey\'s End',
  note:'Elf mage, long walk',
  img:'assets/anime/frieren.jpg', accent:0x6ee7c8, css:'#6ee7c8' }
```

That's it — the panel card and the 3D stand in the gallery ring both appear,
and the ring re-spaces itself. Optionally add a `drawFrieren()` function in
`js/posters.js` and register it under `POSTERS` so there's fallback art if the
photo ever goes missing.

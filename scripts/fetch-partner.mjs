import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const CODE = 'ebots';
const API = `https://discord.com/api/v10/invites/${CODE}?with_counts=true&with_expiration=true`;
const CDN = 'https://cdn.discordapp.com';

const OUT_DIR = 'public/partners';
const TARGET = 'src/content/partnerLive.js';

const AGENT = 'amitista.com partner card (+https://amitista.com/bots)';

async function readInvite() {
  const response = await fetch(API, { headers: { 'User-Agent': AGENT } });
  if (!response.ok) {
    throw new Error(`the invite API answered ${response.status} ${response.statusText}`);
  }
  const invite = await response.json();
  if (!invite?.guild?.id) {
    throw new Error('the invite API answered without a guild — is the invite still live?');
  }
  return invite;
}

async function saveImage(url, name, width, quality) {
  const response = await fetch(url, { headers: { 'User-Agent': AGENT } });
  if (!response.ok) {
    throw new Error(`${name}: the CDN answered ${response.status}`);
  }

  const source = Buffer.from(await response.arrayBuffer());
  const file = path.join(OUT_DIR, `${name}.webp`);

  const image = sharp(source).resize({ width, withoutEnlargement: true, kernel: 'lanczos3' });
  const output = await image.webp({ quality }).toBuffer();
  await writeFile(file, output);

  const { width: w, height: h } = await sharp(output).metadata();
  console.log(`[partner] ${file}  ${w}x${h}  ${(output.length / 1024).toFixed(1)} KB`);

  return `/${path.posix.join('partners', `${name}.webp`)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const invite = await readInvite();
  const guild = invite.guild;

  const icon = guild.icon
    ? await saveImage(`${CDN}/icons/${guild.id}/${guild.icon}.png?size=256`, 'essential-bots-icon', 256, 92)
    : null;

  const banner = guild.banner
    ? await saveImage(
        `${CDN}/banners/${guild.id}/${guild.banner}.png?size=1024`,
        'essential-bots-banner',
        1024,
        80,
      )
    : null;

  const live = {
    guildId: guild.id,
    code: invite.code,
    name: guild.name,
    members: invite.approximate_member_count ?? null,
    online: invite.approximate_presence_count ?? null,
    boosts: guild.premium_subscription_count ?? null,
    icon,
    banner,
    checked: today(),
  };

  const body = `export const PARTNER_LIVE = ${JSON.stringify(live, null, 2)};\n`;
  await writeFile(TARGET, body);

  console.log(
    `[partner] ${guild.name} — ${live.members} members, ${live.online} online, ` +
      `${live.boosts} boosts, written to ${TARGET}`,
  );
  console.log('[partner] run `npm run images` next so the new artwork reaches /img.');
}

main().catch((error) => {
  console.error('[partner]', error.message);
  process.exit(1);
});

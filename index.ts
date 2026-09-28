import type {ModApi} from '@commandcode/harness';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';

// cmd-xp: XP and levels for shipping.
// tests, builds, commits, pushes and deploys earn XP. level up. keep the streak alive.
// /level shows your rank. progress is saved to ~/.commandcode/xp.json

const FILE = process.env.CMD_XP_FILE ?? join(homedir(), '.commandcode', 'xp.json');

const MAX_LEVEL = 1000;

// xp needed to reach a 1-based level. each level costs 2 xp more than the last,
// starting at 50: lvl 2 = 50, lvl 3 = 102, lvl 10 = 522, lvl 100 = 14652, lvl 1000 = 1046952
const xpFor = (lvl: number): number => (lvl - 1) * (lvl + 48);

// titles are spread evenly across the 1000 levels, ~91 levels each
const TITLES = [
	'napkin coder',
	'tinkerer',
	'hacker',
	'builder',
	'shipper',
	'maker',
	'architect',
	'10x',
	'wizard',
	'legend',
	'mythic',
];

type Kind = 'test' | 'build' | 'commit' | 'push' | 'ship' | 'fix' | 'try';

interface State {
	xp: number;
	counts: Record<Kind, number>;
	streakDays: number;
	bestStreak: number;
	lastDay: string;
}

const fresh = (): State => ({
	xp: 0,
	counts: {test: 0, build: 0, commit: 0, push: 0, ship: 0, fix: 0, try: 0},
	streakDays: 0,
	bestStreak: 0,
	lastDay: '',
});

const TEST_RE = /\b(vitest|jest|pytest|mocha|playwright test|cargo test|go test|npm (run )?test|pnpm (run )?test|yarn test|bun test)\b/;
const BUILD_RE = /\b(npm run build|pnpm (run )?build|yarn build|bun run build|cargo build|tsc)\b/;
const COMMIT_RE = /\bgit commit\b/;
const PUSH_RE = /\bgit push\b/;
const SHIP_RE = /\b(vercel|netlify deploy|fly deploy|wrangler (deploy|publish)|docker push|firebase deploy|npm publish|gh release create)\b/;

const REWARD: Record<Kind, {xp: number; label: string}> = {
	test: {xp: 10, label: 'tests passed'},
	build: {xp: 15, label: 'build passed'},
	commit: {xp: 25, label: 'committed'},
	push: {xp: 40, label: 'pushed'},
	ship: {xp: 100, label: 'SHIPPED'},
	fix: {xp: 20, label: 'bug squashed'},
	try: {xp: 2, label: 'tried'},
};

const c = {
	dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
	yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
	green: (s: string) => `\x1b[32m${s}\x1b[0m`,
	magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
	cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
	bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

function load(): State {
	try {
		if (!existsSync(FILE)) return fresh();
		const raw = JSON.parse(readFileSync(FILE, 'utf8')) as Partial<State>;
		const base = fresh();
		return {
			...base,
			...raw,
			counts: {...base.counts, ...(raw.counts ?? {})},
		};
	} catch {
		return fresh();
	}
}

function save(state: State): void {
	try {
		mkdirSync(dirname(FILE), {recursive: true});
		writeFileSync(FILE, JSON.stringify(state, null, 2));
	} catch {
		// never break the session over a save
	}
}

// returns 1-based level for an xp total
function levelOf(xp: number): number {
	let lvl = 1;
	while (lvl < MAX_LEVEL && xp >= xpFor(lvl + 1)) lvl++;
	return lvl;
}

function titleOf(lvl: number): string {
	const span = Math.ceil(MAX_LEVEL / TITLES.length);
	return TITLES[Math.min(TITLES.length - 1, Math.floor((lvl - 1) / span))];
}

function bar(xp: number): string {
	const lvl = levelOf(xp);
	const width = 12;
	if (lvl >= MAX_LEVEL) return `[${'█'.repeat(width)}] MAX`;
	const from = xpFor(lvl);
	const to = xpFor(lvl + 1);
	const filled = Math.round(((xp - from) / (to - from)) * width);
	return `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}] ${xp}/${to}`;
}

const dayKey = (d: Date): string => d.toISOString().slice(0, 10);

export default function (cmd: ModApi): void {
	const state = load();
	const lastAward: Partial<Record<Kind, number>> = {};
	let lastTestFailed = false;

	const status = (): void => {
		try {
			const lvl = levelOf(state.xp);
			cmd.ui.setStatus(`lvl ${lvl} ${titleOf(lvl)} · ${state.xp} xp`);
		} catch {
			// headless: no status segment
		}
	};
	status();

	cmd.addRenderer('xp', (data: {lines: string[]}) => data.lines);

	const award = (kind: Kind): void => {
		const now = Date.now();
		// cooldown so the same command spammed does not farm xp
		if (kind !== 'ship' && now - (lastAward[kind] ?? 0) < 8000) return;
		lastAward[kind] = now;

		const lines: string[] = [];
		const before = levelOf(state.xp);

		// daily streak
		const today = dayKey(new Date());
		let bonus = 0;
		if (state.lastDay !== today) {
			const yesterday = dayKey(new Date(Date.now() - 86400000));
			state.streakDays = state.lastDay === yesterday ? state.streakDays + 1 : 1;
			state.bestStreak = Math.max(state.bestStreak, state.streakDays);
			state.lastDay = today;
			bonus = 10;
			lines.push(c.cyan(`[xp] day ${state.streakDays} streak. +${bonus} xp`));
		}

		const reward = REWARD[kind];
		state.xp += reward.xp + bonus;
		state.counts[kind] += 1;

		const after = levelOf(state.xp);
		lines.push(
			`${c.yellow(`[xp] +${reward.xp} xp`)} ${reward.label}  ${c.dim(bar(state.xp))}  ${c.dim(`lvl ${after} ${titleOf(after)}`)}`,
		);

		if (after > before) {
			const promoted = titleOf(before) !== titleOf(after);
			const rank = promoted ? `${titleOf(before)} -> ${titleOf(after)}` : titleOf(after);
			lines.push(c.magenta(c.bold(`[xp] ★ LEVEL UP ★  ${rank}  (lvl ${after})`)));
		}

		save(state);
		status();
		cmd.showEntry('xp', {lines});
	};

	cmd.addCommand({
		name: 'level',
		description: 'See your shipping rank, XP and streak',
		handler: () => {
			const lvl = levelOf(state.xp);
			const k = state.counts;
			return {
				message: [
					`[xp] lvl ${lvl} ${c.bold(titleOf(lvl))}`,
					`[xp] ${bar(state.xp)}`,
					`[xp] streak ${state.streakDays} days (best ${state.bestStreak})`,
					`[xp] ${k.test} tests, ${k.build} builds, ${k.commit} commits, ${k.push} pushes, ${k.ship} ships, ${k.fix} bugs squashed`,
				].join('\n'),
			};
		},
	});

	cmd.hooks({
		afterToolCall({toolName, input, isError}) {
			if (toolName !== 'shell_command') return undefined;
			const command: string = (input as {command?: string})?.command ?? '';

			if (SHIP_RE.test(command) && !isError) {
				award('ship');
			} else if (PUSH_RE.test(command) && !isError) {
				award('push');
			} else if (COMMIT_RE.test(command) && !isError) {
				award('commit');
			} else if (TEST_RE.test(command)) {
				if (isError) {
					lastTestFailed = true;
					award('try');
				} else {
					award(lastTestFailed ? 'fix' : 'test');
					lastTestFailed = false;
				}
			} else if (BUILD_RE.test(command) && !isError) {
				award('build');
			}
			return undefined;
		},
	});
}

const BASE = 1000;

function calcChipTotal(n10, n20, n50, n100) {
    return n10 * 10 + n20 * 20 + n50 * 50 + n100 * 100;
}

function calcInvested(buyIns) {
    return (1 + buyIns) * BASE;
}

function calcPnl(chipTotal, invested) {
    return chipTotal - invested;
}

function calcResults(submissions) {
    const results = submissions.map(s => {
        const chipTotal = calcChipTotal(s.n10, s.n20, s.n50, s.n100);
        const invested = calcInvested(s.buyIns);
        const pnl = calcPnl(chipTotal, invested);
        return { name: s.name, avatarId: s.avatarId, chipTotal, invested, pnl };
    });
    const totalPnl = results.reduce((sum, r) => sum + r.pnl, 0);
    return { results, totalPnl, isBalanced: totalPnl === 0 };
}

function formatPnl(pnl) {
    if (pnl > 0) return "+" + pnl;
    return String(pnl);
}

function genRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    let code = "";
    for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

// Aggregate P&L across selected rounds by player name (name-matched, absent = 0)
function calcNightSummary(selectedRounds) {
    const playerMap = {};
    selectedRounds.forEach(round => {
        if (!round.results) return;
        Object.values(round.results).forEach(r => {
            if (!playerMap[r.name]) playerMap[r.name] = 0;
            playerMap[r.name] += r.pnl;
        });
    });
    const players = Object.entries(playerMap)
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total);
    return { players, roundCount: selectedRounds.length };
}

// 成就称号：对一组对局评出正面/有趣的称号。门槛制、宁缺毋滥、一人最多一个。
// 返回 [{ name, avatarId, avatarRef, key, emoji, text }]，可能为空数组。
// 注意：借底类(不服就干)依赖每局存的 buyIns，老记录无此字段时按 0 处理，不报错。
function calcNightTitles(selectedRounds) {
    const m = {};
    selectedRounds.forEach(round => {
        if (!round.results) return;
        Object.values(round.results).forEach(r => {
            const s = m[r.name] || (m[r.name] = {
                name: r.name, avatarId: r.avatarId || 0, avatarRef: r.avatarRef || null,
                total: 0, played: 0, wins: 0, pnls: [], biggestWin: -Infinity, worstLoss: 0, buyIns: 0
            });
            s.total += r.pnl; s.played++; if (r.pnl > 0) s.wins++;
            s.pnls.push(r.pnl);
            s.biggestWin = Math.max(s.biggestWin, r.pnl);
            s.worstLoss = Math.min(s.worstLoss, r.pnl);
            s.buyIns += (r.buyIns || 0);
            s.avatarId = (r.avatarId != null) ? r.avatarId : s.avatarId;
            if (r.avatarRef) s.avatarRef = r.avatarRef;
        });
    });
    const stats = Object.values(m);
    stats.forEach(s => {
        let cur = 0, best = 0;
        s.pnls.forEach(p => { if (p > 0) { cur++; best = Math.max(best, cur); } else cur = 0; });
        s.streak = best;
        s.winRate = s.played ? s.wins / s.played : 0;
        const half = Math.ceil(s.pnls.length / 2);
        s.firstHalf = s.pnls.slice(0, half).reduce((a, p) => a + p, 0);
    });

    const byTotal = [...stats].sort((a, b) => b.total - a.total);
    const titled = new Set();   // 一人最多一个称号
    const out = [];
    const give = (s, key, emoji, text) => {
        if (s && !titled.has(s.name)) {
            titled.add(s.name);
            out.push({ name: s.name, avatarId: s.avatarId, avatarRef: s.avatarRef, key, emoji, text });
            return true;
        }
        return false;
    };

    // 锚点：达门槛才发
    const top = byTotal[0];
    if (top && top.total >= BASE) give(top, 'winner', '🏆', '今晚大赢家');
    const bottom = byTotal[byTotal.length - 1];
    if (bottom && bottom.total <= -BASE) give(bottom, 'fish', '💸', '快乐源泉');

    // 花式池：按 score 取最突出的「最多一个」，持有者未被授勋才发
    const flavor = [];
    stats.forEach(s => {
        if (s.played >= 4 && (s.streak >= 3 || s.winRate >= 0.75))
            flavor.push({ s, key: 'streak', emoji: '🎯', text: '常胜将军', score: s.streak * 1000 + s.winRate * 100 });
        if (s.played >= 4 && s.total >= 0 && s.worstLoss > -BASE)
            flavor.push({ s, key: 'steady', emoji: '🪨', text: '稳如泰山', score: 500 });
        if (s.played >= 4 && s.firstHalf < 0 && s.total > 0)
            flavor.push({ s, key: 'comeback', emoji: '🔥', text: '后程发力', score: 800 + s.total / 1000 });
        if (s.biggestWin >= 3 * BASE)
            flavor.push({ s, key: 'bigheart', emoji: '🎰', text: '大心脏', score: 600 + s.biggestWin / 1000 });
        if (s.buyIns >= 3 && s.total > 0)
            flavor.push({ s, key: 'fighter', emoji: '💪', text: '不服就干', score: 10000 });
    });
    flavor.sort((a, b) => b.score - a.score);
    for (const f of flavor) { if (give(f.s, f.key, f.emoji, f.text)) break; }

    return out;
}

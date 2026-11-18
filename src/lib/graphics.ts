export type GraphicInfo = {
  club: string; color: string; team: string; opponent: string; date: string;
  time: string; venue: string; kind: string
}

function drawWrapped(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, gap: number) {
  let line = ''; let yy = y
  for (const word of text.split(/\s+/)) {
    const test = line ? `${line} ${word}` : word
    if (line && ctx.measureText(test).width > max) { ctx.fillText(line, x, yy); yy += gap; line = word }
    else line = test
  }
  if (line) ctx.fillText(line, x, yy)
  return yy
}

export function downloadGraphic(info: GraphicInfo, mime: 'image/png' | 'image/jpeg' = 'image/png') {
  const canvas = document.createElement('canvas')
  canvas.width = 1080; canvas.height = 1350
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Graphics not supported in this browser')
  const accent = /^#[0-9a-f]{6}$/i.test(info.color) ? info.color : '#c9f072'
  ctx.fillStyle = '#0e1b21'; ctx.fillRect(0, 0, 1080, 1350)
  ctx.fillStyle = accent; ctx.fillRect(0, 0, 15, 1350); ctx.fillRect(76, 86, 90, 8)
  ctx.fillStyle = '#fff'; ctx.font = 'bold 39px Arial'; drawWrapped(ctx, info.club.toUpperCase(), 76, 172, 920, 49)
  ctx.fillStyle = accent; ctx.font = 'bold 56px Arial'; ctx.fillText(info.kind === 'training' ? 'TRAINING DAY' : 'MATCHDAY', 76, 358)
  ctx.fillStyle = '#fff'; ctx.font = 'bold 80px Arial'
  const teamY = drawWrapped(ctx, info.team.toUpperCase() || 'YOUR TEAM', 76, 520, 912, 90)
  if (info.kind === 'match') {
    ctx.fillStyle = '#8da0a8'; ctx.font = 'bold 40px Arial'; ctx.fillText('VS', 76, teamY + 91)
    ctx.fillStyle = '#fff'; ctx.font = 'bold 76px Arial'; drawWrapped(ctx, info.opponent.toUpperCase() || 'TBD', 76, teamY + 194, 912, 86)
  }
  ctx.fillStyle = '#fff'; ctx.font = 'bold 46px Arial'; ctx.fillText(info.date || 'DATE TBD', 76, 1050)
  ctx.font = '30px Arial'; ctx.fillStyle = '#adc0c6'; drawWrapped(ctx, `${info.time || 'Time TBD'} • ${info.venue || 'Venue TBD'}`, 76, 1113, 915, 40)
  ctx.fillStyle = accent; ctx.fillRect(76, 1210, 925, 2)
  ctx.fillStyle = '#fff'; ctx.font = 'bold 28px Arial'; ctx.fillText('CREATED WITH DATETHEMOMENT', 76, 1270)
  const link = document.createElement('a')
  link.href = canvas.toDataURL(mime, 0.92)
  link.download = `datethemoment-${info.date || 'graphic'}.${mime === 'image/png' ? 'png' : 'jpg'}`
  link.click()
}

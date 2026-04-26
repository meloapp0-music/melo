const K = 32;

export function applyEloWin(winnerRating, loserRating) {
  const expectedWin =
    1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const expectedLose = 1 - expectedWin;
  const newWinner = Math.round(winnerRating + K * (1 - expectedWin));
  const newLoser = Math.round(loserRating + K * (0 - expectedLose));
  return { newLoser, newWinner };
}

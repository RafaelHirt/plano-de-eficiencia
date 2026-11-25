const units = ['Unidade Alfa', 'Unidade Beta', 'Unidade Gama', 'Unidade Delta', 'Unidade Épsilon']
const periods = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
const assetsByUnit = [2950000, 2310000, 1820000, 1340000, 890000]
const monthlyVariation = [1.08, 1.21, 1.16, 1.32, 1.15, 1.02, 0.88, 1]

export const demoSource = {
  name: 'Base de demonstração',
  sheets: units,
  skipped: 0,
  invalid: 0,
  duplicates: 0,
  balances: periods.flatMap((period, monthIndex) => units.map((unit, unitIndex) => {
    const assets = Math.round(assetsByUnit[unitIndex] * monthlyVariation[monthIndex])
    const cash = Math.round(assets * (0.35 + 0.07 * unitIndex))
    return {
      id: period + ':' + unitIndex,
      unit,
      period,
      assets,
      cash,
      investments: assets - cash,
      suppliers: Math.round(assets * (0.33 + 0.025 * unitIndex - 0.008 * monthIndex)),
      taxes: Math.round(assets * (0.095 + 0.008 * (unitIndex + 1))),
      personnel: Math.round(assets * (0.131 + 0.014 * unitIndex)),
      socialCharges: Math.round(assets * 0.032),
      loansMade: null,
      loansContracted: null,
      otherLiabilities: Math.round(assets * 0.031),
      contingencies: null,
    }
  })),
}

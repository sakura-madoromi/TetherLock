"""Export a conditional, freight-aware scenario without approving CAD substitutions."""
from pathlib import Path
from decimal import Decimal
import csv
import json

root = Path(__file__).resolve().parents[2]
data = json.loads((root / 'artifacts/v3/engineering/data.json').read_text())
import argparse
parser=argparse.ArgumentParser();parser.add_argument('--historical',action='store_true');args=parser.parse_args()
if not args.historical:
    current=json.loads((root/'engineering/procurement-current.json').read_text())
    scenario={**current,'cadFingerprint':data['cadFingerprint'],'dataFingerprint':data['dataFingerprint'],
              'currentEstimatedCostsExcludingUnknownFreight':data['costs'],
              'fullDeliveredCostVerified':False,'allPhysicalSpecsVerified':False,
              'remaining':data['unresolved'],
              'report':'docs/reviews/v3-procurement-current-2026-10-02.md',
              'auditCSV':'docs/reviews/v3-procurement-current-audit-2026-10-02.csv'}
    out=root/'artifacts/v3/procurement';out.mkdir(parents=True,exist_ok=True)
    (out/'data.json').write_text(json.dumps(scenario,ensure_ascii=False,indent=2)+'\n')
    print('Current screenshot totals:',current['totals']);print('Known limits:',len(data['unresolved']));raise SystemExit(0)
audit = json.loads((root / 'engineering/procurement-quotes.json').read_text())
quotes = {q['materialId']: q for q in audit['quotes']}
assert len(quotes) == len(audit['quotes'])
assert set(quotes) <= {r['id'] for r in data['materials']}
money = lambda x: Decimal(str(x))
device_delta = Decimal(0)
purchase_delta = Decimal(0)
for row in data['materials']:
    if row['id'] in quotes:
        delta = money(quotes[row['id']]['unitPrice']) - money(row['unitPrice'])
        device_delta += delta * money(row['installedQuantity'])
        purchase_delta += delta * money(row['packageQuantity'])
scenario = {
    'observedDate': audit['observedDate'],
    'currency': 'CNY',
    'prototypeQuantity': 1,
    'destination': audit['destination'],
    'cadFingerprint': data['cadFingerprint'],
    'baselineCostsExcludingFreight': data['costs'],
    'conditionalInstalledCostExcludingFreight': float(money(data['costs']['device']) + device_delta),
    'conditionalPackageCostExcludingFreight': float(money(data['costs']['purchase']) + purchase_delta),
    'quotedItemsSubtotal': float(sum(money(q['unitPrice']) for q in quotes.values())),
    'quotedItemsIndividualFreight': float(sum(money(q['freight']) for q in quotes.values())),
    'otherFreight': None,
    'combinedFreightConfirmed': False,
    'physicalFitVerified': False,
    'quotedItemCount': len(quotes),
    'note': f'仅替换{len(quotes)}项报价，其余仍沿用旧估算。总到手价未知；优惠未扣。电机、霍尔板、保护板及替代适配未解决。',
}
out = root / 'artifacts/v3/procurement'
out.mkdir(parents=True, exist_ok=True)
(out / 'data.json').write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + '\n')
csv_path = root / 'docs/reviews/v3-procurement-audit-2026-10-02.csv'
with csv_path.open('w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f)
    w.writerow(['编号', '名称', '类别', '装机数量', '整包数量', '主表单价', '替代情景单价', '报价性质', '寄个旧单项运费', 'SKU链接', '尺寸/适配限制'])
    for row in data['materials']:
        q = quotes.get(row['id'])
        w.writerow([row['id'], row['name'], row['category'], row['installedQuantity'], row['packageQuantity'], row['unitPrice'], q['unitPrice'] if q else row['unitPrice'], '已观察所选SKU优惠前报价，适配待验' if q else '无本次SKU报价，沿用名义值/估算', q['freight'] if q else '未知/不适用', q['url'] if q else '', q['gate'] if q else row['note']])
print(json.dumps(scenario, ensure_ascii=False, indent=2))

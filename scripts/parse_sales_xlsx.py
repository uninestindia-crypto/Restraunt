import zipfile
import xml.etree.ElementTree as ET
import os
import re
import json
import sys

xlsx_path = r"c:\Users\toshiba\Downloads\Innoventry_report_1782898184411.xlsx"

def clean_qty(qty_str):
    if not qty_str:
        return 1.0
    match = re.search(r"([0-9.]+)", qty_str)
    if match:
        return float(match.group(1))
    return 1.0

def format_date(date_str):
    if not date_str:
        return None
    parts = date_str.split('/')
    if len(parts) == 3:
        dd = parts[0].zfill(2)
        mm = parts[1].zfill(2)
        yyyy = parts[2]
        return f"{yyyy}-{mm}-{dd}"
    return date_str

def parse_xlsx(path):
    if not os.path.exists(path):
        print(json.dumps({"error": f"File not found: {path}"}))
        sys.exit(1)
        
    with zipfile.ZipFile(path, 'r') as zip_ref:
        shared_strings = []
        if 'xl/sharedStrings.xml' in zip_ref.namelist():
            sst_xml = zip_ref.read('xl/sharedStrings.xml')
            root = ET.fromstring(sst_xml)
            for si in root:
                t_val = "".join([t.text for t in si.iter() if t.tag.endswith('}t') or t.tag == 't' if t.text])
                shared_strings.append(t_val)
        
        sheet_path = 'xl/worksheets/sheet1.xml'
        if sheet_path not in zip_ref.namelist():
            print(json.dumps({"error": "sheet1.xml not found"}))
            sys.exit(1)
            
        sheet_xml = zip_ref.read(sheet_path)
        root = ET.fromstring(sheet_xml)
        
        rows = {}
        for elem in root.iter():
            tag = elem.tag.split('}')[-1]
            if tag == 'row':
                row_idx = int(elem.attrib.get('r'))
                rows[row_idx] = {}
            elif tag == 'c':
                cell_ref = elem.attrib.get('r')
                cell_type = elem.attrib.get('t')
                
                row_num_str = "".join([c for c in cell_ref if c.isdigit()])
                col_letter = "".join([c for c in cell_ref if c.isalpha()])
                row_idx = int(row_num_str)
                
                val_elem = elem.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                if val_elem is None:
                    val_elem = elem.find('v')
                
                val = val_elem.text if val_elem is not None else None
                if val is not None:
                    if cell_type == 's':
                        val = shared_strings[int(val)]
                
                if row_idx not in rows:
                    rows[row_idx] = {}
                rows[row_idx][col_letter] = val
        
        vouchers = []
        current_vch = None
        last_date = "2024-02-01"
        
        for r in sorted(rows.keys()):
            if r < 7:
                continue
            row_data = rows[r]
            if not row_data:
                continue
            
            vch_no = row_data.get('B')
            date_str = row_data.get('A')
            particulars = row_data.get('C')
            
            if vch_no or date_str:
                if current_vch:
                    vouchers.append(current_vch)
                
                bill_amt = row_data.get('Q')
                try:
                    bill_amt_val = float(bill_amt) if bill_amt else 0.0
                except ValueError:
                    bill_amt_val = 0.0
                
                cleaned_date = None
                if date_str:
                    date_str_stripped = str(date_str).strip()
                    if date_str_stripped:
                        cleaned_date = format_date(date_str_stripped)
                
                if cleaned_date:
                    last_date = cleaned_date
                
                current_vch = {
                    'vch_no': str(vch_no).strip() if vch_no else "",
                    'date': last_date,
                    'payment_method': particulars,
                    'bill_amount': bill_amt_val,
                    'items': []
                }
            else:
                if current_vch is not None and particulars:
                    qty_str = row_data.get('G')
                    rate_str = row_data.get('H')
                    amount_str = row_data.get('I') or row_data.get('O')
                    
                    qty = clean_qty(qty_str)
                    try:
                        rate = float(rate_str) if rate_str else 0.0
                    except ValueError:
                        rate = 0.0
                    try:
                        amount = float(amount_str) if amount_str else qty * rate
                    except ValueError:
                        amount = qty * rate
                    
                    current_vch['items'].append({
                        'name': particulars,
                        'qty': qty,
                        'rate': rate,
                        'amount': amount
                    })
        
        if current_vch:
            vouchers.append(current_vch)
            
        print(json.dumps(vouchers, indent=2))

if __name__ == '__main__':
    parse_xlsx(xlsx_path)

#!/usr/bin/env python3

"""

Rochester Shell — Passport XML Daily Sales Aggregator

Reads NAXML-POSJournal XML files and produces a daily sales summary CSV.

No external dependencies — pure Python standard library.



Usage:

  python3 rs_xml_parser.py                  # reads XMLs from same folder as script

  python3 rs_xml_parser.py /path/to/folder  # reads XMLs from specified folder

"""



import xml.etree.ElementTree as ET

import os, sys, csv

from collections import defaultdict

from datetime import datetime



# ── Department code → name ────────────────────────────────────────

DEPT_MAP = {

    "12": "Auto Parts",      "6":  "Beer",            "13": "Candy",

    "10": "Cig Cartons",     "5":  "Cigs",            "19": "Coffee",

    "11": "Deli",            "1":  "Edible",          "16": "Fountain",

    "17": "Gas Card",        "21": "GROC NO TAX",     "24": "Hot Food",

    "18": "Ice",             "14": "Instant Lottery", "20": "Liquor",

    "15": "Machine Lotto",   "2":  "Non-Edible",      "8":  "Phone Cards",

    "7":  "Porters",         "22": "SC",              "3":  "Snacks",

    "9":  "Soda",            "99999": "Store Coupon", "4":  "Tobacco",

    "23": "PAID OUT",        "1024": "Fuel 1",        "1025": "Fuel 2",

    "88888": "Car Wash",     "99998": "Cash Card",    "200": "Non-Taxable Items",

    "99994": "Outside Lottery",

}



FUEL_GRADES = {"001": "Regular", "002": "Plus", "003": "Premium"}



# Dept columns in report order (Inside Sales only, excluding fuel/lottery/paid out)

INSIDE_DEPTS = [

    "Auto Parts", "Beer", "Candy", "Cig Cartons", "Cigs", "Coffee",

    "Deli", "Edible", "Fountain", "GROC NO TAX", "Hot Food", "Ice",

    "Liquor", "Non-Edible", "Phone Cards", "Porters", "SC",

    "Snacks", "Soda", "Tobacco",

]



# Tender codes that count as Credit Cards for reconciliation

CC_TENDER_CODES = {"creditCards", "outsideCredit", "debitCards", "outsideDebit"}



def parse_file(fpath, by_date):

    """Parse one XML file and accumulate into by_date dict."""

    if os.path.getsize(fpath) == 0:

        return

    try:

        tree = ET.parse(fpath)

        root = tree.getroot()

        se = root.find(".//SaleEvent")

        if se is None:

            return



        biz_date = se.findtext("BusinessDate", "").strip()

        if not biz_date:

            return



        day = by_date[biz_date]

        day["transaction_count"] += 1



        for tl in root.findall(".//TransactionLine"):

            status = tl.get("status", "normal")



            # ── Fuel (actual delivery only — FuelLine, not FuelPrepayLine) ──

            fl = tl.find("FuelLine")

            if fl is not None and status == "normal":

                grade_id = fl.findtext("FuelGradeID", "").strip()

                grade    = FUEL_GRADES.get(grade_id, f"Grade{grade_id}")

                amt      = float(fl.findtext("SalesAmount",  0) or 0)

                gal      = float(fl.findtext("SalesQuantity", 0) or 0)

                day["fuel"][grade]["amount"]  += amt

                day["fuel"][grade]["gallons"] += gal



            # ── Merchandise / dept sales ──────────────────────────────────

            il = tl.find("ItemLine")

            if il is not None and status == "normal":

                code = str(il.findtext("MerchandiseCode", "")).strip()

                amt  = float(il.findtext("SalesAmount", 0) or 0)

                name = DEPT_MAP.get(code, f"Dept{code}")

                day["dept"][name] += amt



            # ── Tender ───────────────────────────────────────────────────

            ti = tl.find("TenderInfo")

            if ti is not None and status == "normal":

                tcode = ti.findtext("Tender/TenderCode", "").strip()

                tamt  = float(ti.findtext("TenderAmount", 0) or 0)

                day["tender"][tcode] += tamt

                if tcode in CC_TENDER_CODES:

                    day["total_cc"] += tamt

                elif tcode == "cash":

                    day["total_cash"] += tamt



            # ── Tax ──────────────────────────────────────────────────────

            tt = tl.find("TransactionTax")

            if tt is not None and status == "normal":

                tax = float(tt.findtext("TaxCollectedAmount", 0) or 0)

                day["tax_collected"] += tax



    except ET.ParseError as e:

        print(f"  ⚠ Parse error in {os.path.basename(fpath)}: {e}")

    except Exception as e:

        print(f"  ⚠ Error in {os.path.basename(fpath)}: {e}")





def new_day():

    return {

        "transaction_count": 0,

        "dept":  defaultdict(float),

        "fuel":  defaultdict(lambda: {"amount": 0.0, "gallons": 0.0}),

        "tender": defaultdict(float),

        "total_cc":   0.0,

        "total_cash": 0.0,

        "tax_collected": 0.0,

    }





def main():

    # ── Folder selection ──────────────────────────────────────────

    if len(sys.argv) > 1:

        folder = sys.argv[1]

    else:

        default = os.path.dirname(os.path.abspath(__file__))

        folder = input(f"XML folder path (Enter for script folder: {default}): ").strip()

        if not folder:

            folder = default



    if not os.path.isdir(folder):

        print(f"ERROR: Folder not found: {folder}")

        sys.exit(1)



    xml_files = sorted([

        os.path.join(folder, f)

        for f in os.listdir(folder)

        if f.lower().endswith(".xml")

    ])



    if not xml_files:

        print(f"No XML files found in: {folder}")

        sys.exit(1)



    print(f"\nFound {len(xml_files)} XML files in: {folder}")

    print("Parsing... (this may take a moment for large folders)\n")



    by_date = defaultdict(new_day)



    for i, fpath in enumerate(xml_files):

        parse_file(fpath, by_date)

        if (i + 1) % 200 == 0:

            print(f"  Processed {i+1}/{len(xml_files)}...")



    if not by_date:

        print("No data found. Check that files are NAXML-POSJournal format.")

        sys.exit(1)



    # ── Console summary ───────────────────────────────────────────

    print(f"\n{'='*60}")

    print(f"ROCHESTER SHELL — Daily Sales Summary")

    print(f"Dates found: {', '.join(sorted(by_date.keys()))}")

    print(f"{'='*60}")



    for date in sorted(by_date.keys()):

        d = by_date[date]



        fuel_gross   = sum(g["amount"]  for g in d["fuel"].values())

        fuel_gallons = sum(g["gallons"] for g in d["fuel"].values())



        dept_inside = {k: d["dept"][k] for k in INSIDE_DEPTS if d["dept"][k] != 0}

        dept_sub    = sum(dept_inside.values())



        gas_card     = d["dept"].get("Gas Card", 0)

        instant_lott = d["dept"].get("Instant Lottery", 0)

        mach_lotto   = d["dept"].get("Machine Lotto", 0)

        paid_out     = d["dept"].get("PAID OUT", 0)



        total_inside = dept_sub + gas_card + instant_lott + mach_lotto + d["tax_collected"]

        total_sales  = total_inside + fuel_gross



        print(f"\n📅 {date}  ({d['transaction_count']} transactions)")

        print(f"  Inside dept subtotal : ${dept_sub:>10,.2f}")

        print(f"  Gas Card (pass-thru) : ${gas_card:>10,.2f}")

        print(f"  Instant Lottery (POS): ${instant_lott:>10,.2f}  ← override with manual count")

        print(f"  Machine Lotto (POS)  : ${mach_lotto:>10,.2f}  ← override with lottery report")

        print(f"  Sales Tax            : ${d['tax_collected']:>10,.2f}")

        print(f"  TOTAL INSIDE         : ${total_inside:>10,.2f}")

        print(f"  Fuel Gross           : ${fuel_gross:>10,.2f}  ({fuel_gallons:,.3f} gal)")

        for grade, data in sorted(d["fuel"].items()):

            avg = data["amount"]/data["gallons"] if data["gallons"] else 0

            print(f"    {grade:<10}: ${data['amount']:>9,.2f}  {data['gallons']:>10,.3f} gal  avg ${avg:.3f}")

        print(f"  TOTAL SALES          : ${total_sales:>10,.2f}")

        print(f"  Total CC             : ${d['total_cc']:>10,.2f}")

        print(f"  Cash (POS)           : ${d['total_cash']:>10,.2f}")

        print(f"  PAID OUT (POS)       : ${paid_out:>10,.2f}  ← add manual lottery payouts")

        print(f"  Dept breakdown:")

        for name, amt in sorted(dept_inside.items(), key=lambda x: -x[1]):

            print(f"    {name:<20}: ${amt:>9,.2f}")



    # ── CSV output ────────────────────────────────────────────────

    out_path = os.path.join(folder, "rs_daily_summary.csv")



    fuel_grade_cols = ["Regular", "Plus", "Premium"]

    tender_cols     = ["cash", "creditCards", "debitCards",

                       "outsideCredit", "outsideDebit"]



    fieldnames = (

        ["Date", "Transactions"]

        + INSIDE_DEPTS

        + ["Dept_Subtotal", "Gas_Card", "Instant_Lottery_POS",

           "Machine_Lotto_POS", "Sales_Tax", "Total_Inside"]

        + [f"Fuel_{g}_Amount" for g in fuel_grade_cols]

        + [f"Fuel_{g}_Gallons" for g in fuel_grade_cols]

        + ["Fuel_Total_Amount", "Fuel_Total_Gallons", "Total_Sales"]

        + [f"Tender_{t}" for t in tender_cols]

        + ["Total_CC", "Total_Cash", "PAID_OUT_POS"]

    )



    with open(out_path, "w", newline="", encoding="utf-8") as f:

        writer = csv.DictWriter(f, fieldnames=fieldnames)

        writer.writeheader()



        for date in sorted(by_date.keys()):

            d    = by_date[date]

            sub  = sum(d["dept"].get(k, 0) for k in INSIDE_DEPTS)

            gc   = d["dept"].get("Gas Card", 0)

            il   = d["dept"].get("Instant Lottery", 0)

            ml   = d["dept"].get("Machine Lotto", 0)

            po   = d["dept"].get("PAID OUT", 0)

            fg   = sum(g["amount"]  for g in d["fuel"].values())

            fgal = sum(g["gallons"] for g in d["fuel"].values())

            ti   = sub + gc + il + ml + d["tax_collected"]

            ts   = ti + fg



            row = {"Date": date, "Transactions": d["transaction_count"]}

            for dept in INSIDE_DEPTS:

                row[dept] = round(d["dept"].get(dept, 0), 2)

            row.update({

                "Dept_Subtotal": round(sub, 2),

                "Gas_Card":      round(gc, 2),

                "Instant_Lottery_POS": round(il, 2),

                "Machine_Lotto_POS":   round(ml, 2),

                "Sales_Tax":     round(d["tax_collected"], 2),

                "Total_Inside":  round(ti, 2),

                "Fuel_Total_Amount":  round(fg, 2),

                "Fuel_Total_Gallons": round(fgal, 3),

                "Total_Sales":   round(ts, 2),

                "Total_CC":      round(d["total_cc"], 2),

                "Total_Cash":    round(d["total_cash"], 2),

                "PAID_OUT_POS":  round(po, 2),

            })

            for grade in fuel_grade_cols:

                row[f"Fuel_{grade}_Amount"]  = round(d["fuel"].get(grade, {}).get("amount", 0), 2)

                row[f"Fuel_{grade}_Gallons"] = round(d["fuel"].get(grade, {}).get("gallons", 0), 3)

            for t in tender_cols:

                row[f"Tender_{t}"] = round(d["tender"].get(t, 0), 2)



            writer.writerow(row)



    print(f"\n✅ CSV saved to: {out_path}")

    print("\nNext steps:")

    print("  1. Upload rs_daily_summary.csv to Claude")

    print("  2. Provide bank deposit + lottery payouts + manual scratch count")

    print("  3. Claude fills the reconciliation spreadsheet automatically")

    # input("\nPress Enter to exit...")





if __name__ == "__main__":

    main()


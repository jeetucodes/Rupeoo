#!/usr/bin/env python3
"""
scripts/generate_previews.py
Generates crisp 2x realistic widget preview PNG images for all Rupeo Android widgets.
Outputs true 8-bit RGBA PNG files saved in assets/widget-preview/.
"""

import os
import sys
from PIL import Image, ImageDraw, ImageFont

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "widget-preview")
os.makedirs(OUTPUT_DIR, exist_ok=True)

def get_font(size: int, bold: bool = False):
    try:
        font_name = "arialbd.ttf" if bold else "arial.ttf"
        return ImageFont.truetype(font_name, size)
    except Exception:
        return ImageFont.load_default()

def create_card_canvas(w: int, h: int, radius: int = 24):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # Background card with border
    draw.rounded_rectangle([(2, 2), (w - 3, h - 3)], radius=radius, fill=(255, 255, 255, 255), outline=(226, 232, 240, 255), width=2)
    return img, draw

def draw_rupeo_logo_pill(draw: ImageDraw.ImageDraw, x: int, y: int, title: str = "RUPEO"):
    # Dark rounded brand tag
    draw.rounded_rectangle([(x, y), (x + 22, y + 22)], radius=6, fill=(28, 28, 30, 255))
    font_r = get_font(13, bold=True)
    draw.text((x + 6, y + 3), "R", fill=(255, 215, 64, 255), font=font_r)
    font_title = get_font(13, bold=True)
    draw.text((x + 28, y + 4), title, fill=(15, 23, 42, 255), font=font_title)

# -------------------------------------------------------------
# 1. TodaySummaryWidget (2x1) ~320x160
# -------------------------------------------------------------
def generate_today_summary():
    w, h = 340, 170
    img, draw = create_card_canvas(w, h, radius=22)
    draw_rupeo_logo_pill(draw, 18, 16, "TODAY")

    # Status pill: "LEFT"
    draw.rounded_rectangle([(w - 74, 16), (w - 18, 36)], radius=6, fill=(220, 252, 231, 255))
    draw.text((w - 56, 19), "LEFT", fill=(22, 163, 74, 255), font=get_font(11, bold=True))

    # Spent Today
    draw.text((20, 52), "Spent Today", fill=(100, 116, 139, 255), font=get_font(13, bold=False))
    draw.text((20, 72), "₹850", fill=(15, 23, 42, 255), font=get_font(30, bold=True))

    # Remaining daily limit
    draw.text((20, 130), "₹1,150 remaining daily", fill=(16, 185, 129, 255), font=get_font(13, bold=True))

    path = os.path.join(OUTPUT_DIR, "todaysummarywidget_preview.png")
    img.save(path, "PNG", optimize=True)
    return path

# -------------------------------------------------------------
# 2. QuickAddWidget (4x1) ~640x160
# -------------------------------------------------------------
def generate_quick_add():
    w, h = 640, 160
    img, draw = create_card_canvas(w, h, radius=24)
    draw_rupeo_logo_pill(draw, 22, 16, "RUPEO")

    # Sub-header: Today spent
    draw.text((w - 190, 18), "Today: ₹1,240 • 13:45", fill=(100, 116, 139, 255), font=get_font(13, bold=False))

    # 4 Action buttons
    btn_w = 138
    btn_h = 74
    btn_y = 58
    spacing = 14
    start_x = 22

    # Button 1: Expense
    bx = start_x
    draw.rounded_rectangle([(bx, btn_y), (bx + btn_w, btn_y + btn_h)], radius=14, fill=(254, 242, 242, 255), outline=(254, 202, 202, 255), width=1)
    draw.text((bx + 26, btn_y + 24), "— Expense", fill=(220, 38, 38, 255), font=get_font(17, bold=True))

    # Button 2: Income
    bx += btn_w + spacing
    draw.rounded_rectangle([(bx, btn_y), (bx + btn_w, btn_y + btn_h)], radius=14, fill=(240, 253, 244, 255), outline=(187, 247, 208, 255), width=1)
    draw.text((bx + 28, btn_y + 24), "+ Income", fill=(22, 163, 74, 255), font=get_font(17, bold=True))

    # Button 3: Voice
    bx += btn_w + spacing
    draw.rounded_rectangle([(bx, btn_y), (bx + btn_w, btn_y + btn_h)], radius=14, fill=(238, 242, 255, 255), outline=(199, 210, 254, 255), width=1)
    draw.text((bx + 34, btn_y + 24), "🎙 Voice", fill=(79, 70, 229, 255), font=get_font(17, bold=True))

    # Button 4: Udhar
    bx += btn_w + spacing
    draw.rounded_rectangle([(bx, btn_y), (bx + btn_w, btn_y + btn_h)], radius=14, fill=(248, 250, 252, 255), outline=(226, 232, 240, 255), width=1)
    draw.text((bx + 34, btn_y + 24), "👥 Udhar", fill=(51, 65, 85, 255), font=get_font(17, bold=True))

    path = os.path.join(OUTPUT_DIR, "quickaddwidget_preview.png")
    img.save(path, "PNG", optimize=True)
    return path

# -------------------------------------------------------------
# 3. MonthOverviewWidget (2x2) ~340x340
# -------------------------------------------------------------
def generate_month_overview():
    w, h = 340, 340
    img, draw = create_card_canvas(w, h, radius=24)
    draw_rupeo_logo_pill(draw, 20, 18, "THIS MONTH")
    draw.text((w - 70, 20), "14:20", fill=(148, 163, 184, 255), font=get_font(12, bold=False))

    # Total Balance
    draw.text((22, 60), "Total Balance", fill=(100, 116, 139, 255), font=get_font(13, bold=False))
    draw.text((22, 82), "₹42,500", fill=(15, 23, 42, 255), font=get_font(28, bold=True))

    # Spend vs Income Ratio Bar
    draw.text((22, 136), "Monthly Flow", fill=(100, 116, 139, 255), font=get_font(12, bold=False))
    bar_y = 158
    draw.rounded_rectangle([(22, bar_y), (w - 22, bar_y + 12)], radius=6, fill=(220, 252, 231, 255))
    draw.rounded_rectangle([(22, bar_y), (140, bar_y + 12)], radius=6, fill=(239, 68, 68, 255))

    # Income & Expense Card Box
    box_y = 196
    draw.rounded_rectangle([(20, box_y), (w - 20, box_y + 110)], radius=16, fill=(248, 250, 252, 255), outline=(226, 232, 240, 255), width=1)

    # Income Column
    draw.text((36, box_y + 16), "Income", fill=(22, 163, 74, 255), font=get_font(13, bold=True))
    draw.text((36, box_y + 42), "+₹65,000", fill=(22, 163, 74, 255), font=get_font(18, bold=True))

    # Expense Column
    draw.text((180, box_y + 16), "Spent", fill=(220, 38, 38, 255), font=get_font(13, bold=True))
    draw.text((180, box_y + 42), "-₹22,500", fill=(220, 38, 38, 255), font=get_font(18, bold=True))

    path = os.path.join(OUTPUT_DIR, "monthoverviewwidget_preview.png")
    img.save(path, "PNG", optimize=True)
    return path

# -------------------------------------------------------------
# 4. BudgetProgressWidget (2x2) ~340x340
# -------------------------------------------------------------
def generate_budget_progress():
    w, h = 340, 340
    img, draw = create_card_canvas(w, h, radius=24)
    draw_rupeo_logo_pill(draw, 20, 18, "BUDGET")

    # Status Pill
    draw.rounded_rectangle([(w - 100, 18), (w - 20, 40)], radius=6, fill=(254, 243, 199, 255))
    draw.text((w - 90, 22), "CAUTION", fill=(180, 83, 9, 255), font=get_font(10, bold=True))

    # Percentage Callout
    draw.text((22, 64), "75%", fill=(245, 158, 11, 255), font=get_font(38, bold=True))
    draw.text((120, 84), "used this month", fill=(100, 116, 139, 255), font=get_font(14, bold=False))

    # Progress Bar
    bar_y = 138
    draw.rounded_rectangle([(22, bar_y), (w - 22, bar_y + 14)], radius=7, fill=(241, 245, 249, 255))
    draw.rounded_rectangle([(22, bar_y), (int(22 + (w - 44) * 0.75), bar_y + 14)], radius=7, fill=(245, 158, 11, 255))

    # Detail Block
    box_y = 180
    draw.rounded_rectangle([(20, box_y), (w - 20, box_y + 124)], radius=16, fill=(248, 250, 252, 255), outline=(226, 232, 240, 255), width=1)
    draw.text((36, box_y + 18), "Spent: ₹22,500", fill=(15, 23, 42, 255), font=get_font(16, bold=True))
    draw.text((36, box_y + 50), "Total Budget: ₹30,000", fill=(100, 116, 139, 255), font=get_font(14, bold=False))
    draw.text((36, box_y + 82), "₹7,500 remaining", fill=(16, 185, 129, 255), font=get_font(14, bold=True))

    path = os.path.join(OUTPUT_DIR, "budgetprogresswidget_preview.png")
    img.save(path, "PNG", optimize=True)
    return path

# -------------------------------------------------------------
# 5. RecentTransactionsWidget (4x2) ~640x340
# -------------------------------------------------------------
def generate_recent_transactions():
    w, h = 640, 340
    img, draw = create_card_canvas(w, h, radius=24)
    draw_rupeo_logo_pill(draw, 22, 18, "RECENT TRANSACTIONS")
    draw.text((w - 110, 20), "View All ›", fill=(79, 70, 229, 255), font=get_font(13, bold=True))

    txs = [
        ("Food", "Swiggy Dinner", "13:30", "-₹450", False),
        ("Groceries", "Blinkit Essentials", "11:15", "-₹620", False),
        ("Salary", "Consulting Fee", "09:00", "+₹25,000", True),
        ("Fuel", "HP Petrol Pump", "Yesterday", "-₹500", False),
        ("Shopping", "Amazon Purchase", "Yesterday", "-₹1,299", False),
    ]

    start_y = 62
    row_h = 50
    for idx, (cat, title, time_str, amt, is_inc) in enumerate(txs):
        ry = start_y + idx * row_h
        # Category pill
        cat_bg = (240, 253, 244, 255) if is_inc else (254, 242, 242, 255)
        cat_fg = (22, 163, 74, 255) if is_inc else (220, 38, 38, 255)
        draw.rounded_rectangle([(24, ry + 4), (104, ry + 32)], radius=8, fill=cat_bg)
        draw.text((32, ry + 10), cat, fill=cat_fg, font=get_font(12, bold=True))

        # Title
        draw.text((120, ry + 9), title, fill=(30, 41, 59, 255), font=get_font(15, bold=True))

        # Time
        draw.text((w - 190, ry + 11), time_str, fill=(148, 163, 184, 255), font=get_font(13, bold=False))

        # Amount
        draw.text((w - 100, ry + 9), amt, fill=cat_fg, font=get_font(15, bold=True))

        # Separator line
        if idx < 4:
            draw.line([(24, ry + 44), (w - 24, ry + 44)], fill=(241, 245, 249, 255), width=1)

    path = os.path.join(OUTPUT_DIR, "recenttransactionswidget_preview.png")
    img.save(path, "PNG", optimize=True)
    return path

# -------------------------------------------------------------
# 6. UdharSummaryWidget (2x2) ~340x340
# -------------------------------------------------------------
def generate_udhar_summary():
    w, h = 340, 340
    img, draw = create_card_canvas(w, h, radius=24)
    draw_rupeo_logo_pill(draw, 20, 18, "UDHAR & FRIENDS")
    draw.text((w - 70, 20), "14:15", fill=(148, 163, 184, 255), font=get_font(12, bold=False))

    # Split cards: To Receive vs To Pay
    card_y = 58
    card_w = 142
    card_h = 74

    # To Receive
    draw.rounded_rectangle([(20, card_y), (20 + card_w, card_y + card_h)], radius=12, fill=(240, 253, 244, 255), outline=(220, 252, 231, 255), width=1)
    draw.text((32, card_y + 12), "To Receive", fill=(21, 128, 61, 255), font=get_font(12, bold=True))
    draw.text((32, card_y + 36), "+₹3,500", fill=(22, 163, 74, 255), font=get_font(18, bold=True))

    # To Pay
    draw.rounded_rectangle([(178, card_y), (178 + card_w, card_y + card_h)], radius=12, fill=(254, 242, 242, 255), outline=(254, 226, 226, 255), width=1)
    draw.text((190, card_y + 12), "To Pay", fill=(185, 28, 28, 255), font=get_font(12, bold=True))
    draw.text((190, card_y + 36), "-₹1,200", fill=(220, 38, 38, 255), font=get_font(18, bold=True))

    # Top Friends list
    list_y = 152
    draw.text((22, list_y), "Top Friends", fill=(100, 116, 139, 255), font=get_font(12, bold=True))

    friends = [
        ("Rahul Sharma", "+₹2,000", True),
        ("Amit Verma", "+₹1,500", True),
        ("Vikas Patel", "-₹1,200", False),
    ]

    for idx, (name, bal, is_rec) in enumerate(friends):
        fy = list_y + 26 + idx * 44
        draw.rounded_rectangle([(20, fy), (w - 20, fy + 38)], radius=10, fill=(248, 250, 252, 255), outline=(241, 245, 249, 255), width=1)
        draw.text((32, fy + 10), name, fill=(30, 41, 59, 255), font=get_font(13, bold=True))
        fg = (22, 163, 74, 255) if is_rec else (220, 38, 38, 255)
        draw.text((w - 90, fy + 10), bal, fill=fg, font=get_font(13, bold=True))

    path = os.path.join(OUTPUT_DIR, "udharsummarywidget_preview.png")
    img.save(path, "PNG", optimize=True)
    return path

# -------------------------------------------------------------
# 7. GoalsProgressWidget (4x2) ~640x340
# -------------------------------------------------------------
def generate_goals_progress():
    w, h = 640, 340
    img, draw = create_card_canvas(w, h, radius=24)
    draw_rupeo_logo_pill(draw, 22, 18, "BUDGET GOALS")
    draw.text((w - 110, 20), "Manage ›", fill=(79, 70, 229, 255), font=get_font(13, bold=True))

    goals = [
        ("Monthly Budget", "₹22,500 / ₹30,000", 0.75, (245, 158, 11, 255)),
        ("Food & Groceries", "₹6,400 / ₹10,000", 0.64, (16, 185, 129, 255)),
        ("Entertainment & Shopping", "₹4,800 / ₹5,000", 0.96, (239, 68, 68, 255)),
    ]

    start_y = 66
    for idx, (title, amt_str, ratio, bar_col) in enumerate(goals):
        gy = start_y + idx * 82
        draw.text((24, gy), title, fill=(30, 41, 59, 255), font=get_font(15, bold=True))
        draw.text((w - 200, gy), amt_str, fill=(100, 116, 139, 255), font=get_font(14, bold=True))

        bar_y = gy + 30
        draw.rounded_rectangle([(24, bar_y), (w - 24, bar_y + 12)], radius=6, fill=(241, 245, 249, 255))
        draw.rounded_rectangle([(24, bar_y), (int(24 + (w - 48) * ratio), bar_y + 12)], radius=6, fill=bar_col)

    path = os.path.join(OUTPUT_DIR, "goalsprogresswidget_preview.png")
    img.save(path, "PNG", optimize=True)
    return path

# -------------------------------------------------------------
# 8. UpcomingBillsWidget (4x2) ~640x340
# -------------------------------------------------------------
def generate_upcoming_bills():
    w, h = 640, 340
    img, draw = create_card_canvas(w, h, radius=24)
    draw_rupeo_logo_pill(draw, 22, 18, "UPCOMING BILLS")
    draw.text((w - 120, 20), "Reminders ›", fill=(79, 70, 229, 255), font=get_font(13, bold=True))

    bills = [
        ("Electricity Bill", "Due Tomorrow", "₹2,450", True),
        ("Wi-Fi Broadband", "Due in 3d", "₹999", True),
        ("HDFC Credit Card", "Due in 8d", "₹12,400", False),
    ]

    start_y = 68
    for idx, (title, due_str, amt_str, urgent) in enumerate(bills):
        by = start_y + idx * 80
        draw.rounded_rectangle([(22, by), (w - 22, by + 64)], radius=14, fill=(248, 250, 252, 255), outline=(241, 245, 249, 255), width=1)

        # Title
        draw.text((40, by + 22), title, fill=(30, 41, 59, 255), font=get_font(16, bold=True))

        # Urgency tag
        tag_bg = (254, 243, 199, 255) if urgent else (241, 245, 249, 255)
        tag_fg = (180, 83, 9, 255) if urgent else (100, 116, 139, 255)
        draw.rounded_rectangle([(w - 280, by + 18), (w - 160, by + 46)], radius=8, fill=tag_bg)
        draw.text((w - 268, by + 24), due_str, fill=tag_fg, font=get_font(12, bold=True))

        # Amount
        draw.text((w - 140, by + 20), amt_str, fill=(15, 23, 42, 255), font=get_font(17, bold=True))

    path = os.path.join(OUTPUT_DIR, "upcomingbillswidget_preview.png")
    img.save(path, "PNG", optimize=True)
    return path

# -------------------------------------------------------------
# 9. WeeklySpendingWidget (4x2) ~640x340
# -------------------------------------------------------------
def generate_weekly_spending():
    w, h = 640, 340
    img, draw = create_card_canvas(w, h, radius=24)
    draw_rupeo_logo_pill(draw, 22, 18, "WEEKLY SPENDING")
    draw.text((w - 180, 20), "Total: ₹5,450 • 13:45", fill=(15, 23, 42, 255), font=get_font(13, bold=True))

    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    amounts = [400, 850, 300, 1200, 1500, 700, 500]
    is_todays = [False, False, False, True, False, False, False]
    max_amt = max(amounts)

    chart_top = 70
    chart_h = 200
    col_w = 64
    spacing = 18
    start_x = 36

    for idx in range(7):
        cx = start_x + idx * (col_w + spacing)
        amt = amounts[idx]
        bar_h = int((amt / max_amt) * 150)
        is_today = is_todays[idx]

        # Background pill
        draw.rounded_rectangle([(cx + 18, chart_top + 10), (cx + 46, chart_top + 180)], radius=8, fill=(238, 242, 255, 255) if is_today else (248, 250, 252, 255))

        # Filled bar
        fill_col = (79, 70, 229, 255) if is_today else (148, 163, 184, 255)
        bar_top = chart_top + 180 - bar_h
        draw.rounded_rectangle([(cx + 18, bar_top), (cx + 46, chart_top + 180)], radius=8, fill=fill_col)

        # Day text
        day_col = (79, 70, 229, 255) if is_today else (100, 116, 139, 255)
        draw.text((cx + 20, chart_top + 194), days[idx], fill=day_col, font=get_font(13, bold=is_today))

        # Amount text
        draw.text((cx + 14, bar_top - 20), f"₹{amt}", fill=(100, 116, 139, 255), font=get_font(11, bold=is_today))

    path = os.path.join(OUTPUT_DIR, "weeklyspendingwidget_preview.png")
    img.save(path, "PNG", optimize=True)
    return path

# -------------------------------------------------------------
# 10. InsightWidget & QuickActionsWidget (Legacy mappings)
# -------------------------------------------------------------
def generate_legacy():
    # InsightWidget uses month overview design at 4x2
    w, h = 640, 340
    img, draw = create_card_canvas(w, h, radius=24)
    draw_rupeo_logo_pill(draw, 22, 18, "MONTHLY INSIGHTS")
    draw.text((w - 110, 20), "Overview ›", fill=(79, 70, 229, 255), font=get_font(13, bold=True))

    draw.text((24, 62), "Total Balance", fill=(100, 116, 139, 255), font=get_font(13, bold=False))
    draw.text((24, 82), "₹42,500", fill=(15, 23, 42, 255), font=get_font(30, bold=True))

    draw.text((24, 136), "Budget Utilisation (75%)", fill=(100, 116, 139, 255), font=get_font(13, bold=True))
    draw.rounded_rectangle([(24, 160), (w - 24, 174)], radius=7, fill=(241, 245, 249, 255))
    draw.rounded_rectangle([(24, 160), (int(24 + (w - 48) * 0.75), 174)], radius=7, fill=(245, 158, 11, 255))

    box_y = 200
    draw.rounded_rectangle([(24, box_y), (w - 24, box_y + 104)], radius=16, fill=(248, 250, 252, 255), outline=(226, 232, 240, 255), width=1)
    draw.text((44, box_y + 18), "Income: +₹65,000", fill=(22, 163, 74, 255), font=get_font(17, bold=True))
    draw.text((44, box_y + 54), "Spent: -₹22,500", fill=(220, 38, 38, 255), font=get_font(17, bold=True))
    draw.text((w - 240, box_y + 36), "On Track to Save ₹42.5K", fill=(79, 70, 229, 255), font=get_font(14, bold=True))

    p1 = os.path.join(OUTPUT_DIR, "insightwidget_preview.png")
    img.save(p1, "PNG", optimize=True)

    # QuickActionsWidget uses QuickAdd design
    p2 = os.path.join(OUTPUT_DIR, "quickactionswidget_preview.png")
    quick_add_img = Image.open(os.path.join(OUTPUT_DIR, "quickaddwidget_preview.png"))
    quick_add_img.save(p2, "PNG", optimize=True)
    return p1, p2

def main():
    print("Generating widget preview PNGs in assets/widget-preview/ ...")
    files = [
        generate_today_summary(),
        generate_quick_add(),
        generate_month_overview(),
        generate_budget_progress(),
        generate_recent_transactions(),
        generate_udhar_summary(),
        generate_goals_progress(),
        generate_upcoming_bills(),
        generate_weekly_spending(),
    ]
    f1, f2 = generate_legacy()
    files.extend([f1, f2])

    print(f"Generated {len(files)} preview images.")
    for f in files:
        size_kb = os.path.getsize(f) / 1024
        print(f"  -> {os.path.basename(f)}: {size_kb:.1f} KB")

if __name__ == "__main__":
    main()

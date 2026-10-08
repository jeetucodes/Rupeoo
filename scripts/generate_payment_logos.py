import os
from PIL import Image, ImageDraw, ImageFont

os.makedirs('assets/payment-logos', exist_ok=True)

# Helper to save valid 8-bit RGBA PNG
def save_rgba_png(img, path):
    rgba_img = img.convert('RGBA')
    rgba_img.save(path, 'PNG', optimize=True)
    size_kb = os.path.getsize(path) / 1024
    print(f"Saved {path}: {size_kb:.1f} KB")

# 1. Google Pay (GPay) Logo
# Size 120x48 (clean pill with G icon + Pay text or iconic GPay mark)
def create_gpay_logo():
    w, h = 140, 52
    img = Image.new('RGBA', (w, h), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)
    
    # White rounded pill with subtle border
    draw.rounded_rectangle([2, 2, w - 3, h - 3], radius=12, fill=(255, 255, 255, 255), outline=(226, 232, 240, 255), width=2)
    
    # Google 'G' multicolored arcs on left (cx=28, cy=26, r=14)
    cx, cy, r = 32, 26, 14
    # Red top arc
    draw.arc([cx - r, cy - r, cx + r, cy + r], start=210, end=330, fill=(234, 67, 53, 255), width=4)
    # Yellow left arc
    draw.arc([cx - r, cy - r, cx + r, cy + r], start=120, end=210, fill=(251, 188, 5, 255), width=4)
    # Green bottom arc
    draw.arc([cx - r, cy - r, cx + r, cy + r], start=30, end=120, fill=(52, 168, 83, 255), width=4)
    # Blue right arc & bar
    draw.arc([cx - r, cy - r, cx + r, cy + r], start=330, end=30, fill=(66, 133, 244, 255), width=4)
    draw.line([cx, cy, cx + r - 1, cy], fill=(66, 133, 244, 255), width=4)
    
    # Text "Pay"
    # Try system font or draw clean typography
    try:
        font = ImageFont.truetype('arialbd.ttf', 20)
    except:
        font = ImageFont.load_default()
    
    draw.text((56, 14), "Pay", fill=(95, 99, 104, 255), font=font)
    save_rgba_png(img, 'assets/payment-logos/gpay.png')

# 2. PhonePe Logo
# Size 140x52 (PhonePe purple rounded pill with PhonePe emblem & text)
def create_phonepe_logo():
    w, h = 140, 52
    img = Image.new('RGBA', (w, h), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)
    
    # White rounded pill
    draw.rounded_rectangle([2, 2, w - 3, h - 3], radius=12, fill=(255, 255, 255, 255), outline=(226, 232, 240, 255), width=2)
    
    # PhonePe purple emblem circle (cx=28, cy=26, r=15)
    cx, cy, r = 28, 26, 15
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(95, 37, 159, 255))
    
    # Stylized Hindi "पे" in white inside circle
    # Vertical line
    draw.line([cx - 2, cy - 8, cx - 2, cy + 8], fill=(255, 255, 255, 255), width=3)
    # Top horizontal
    draw.line([cx - 8, cy - 8, cx + 7, cy - 8], fill=(255, 255, 255, 255), width=3)
    # Loop of 'प'
    draw.arc([cx - 8, cy - 7, cx + 2, cy + 3], start=0, end=180, fill=(255, 255, 255, 255), width=3)
    draw.line([cx - 8, cy - 8, cx - 8, cy - 2], fill=(255, 255, 255, 255), width=3)
    # Slant matra on top
    draw.line([cx - 3, cy - 8, cx - 7, cy - 12], fill=(255, 255, 255, 255), width=2)

    try:
        font = ImageFont.truetype('arialbd.ttf', 16)
    except:
        font = ImageFont.load_default()
        
    draw.text((50, 16), "PhonePe", fill=(95, 37, 159, 255), font=font)
    save_rgba_png(img, 'assets/payment-logos/phonepe.png')

# 3. Paytm Logo
# Size 140x52 (Paytm brand mark: "Pay" in dark navy + "tm" in cyan)
def create_paytm_logo():
    w, h = 140, 52
    img = Image.new('RGBA', (w, h), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)
    
    # White rounded pill
    draw.rounded_rectangle([2, 2, w - 3, h - 3], radius=12, fill=(255, 255, 255, 255), outline=(226, 232, 240, 255), width=2)
    
    try:
        font_pay = ImageFont.truetype('arialbd.ttf', 22)
        font_tm = ImageFont.truetype('arialbd.ttf', 22)
    except:
        font_pay = ImageFont.load_default()
        font_tm = ImageFont.load_default()
        
    draw.text((22, 13), "Pay", fill=(0, 46, 110, 255), font=font_pay)
    draw.text((68, 13), "tm", fill=(0, 186, 242, 255), font=font_tm)
    save_rgba_png(img, 'assets/payment-logos/paytm.png')

if __name__ == '__main__':
    create_gpay_logo()
    create_phonepe_logo()
    create_paytm_logo()
    print("All payment logos generated successfully!")

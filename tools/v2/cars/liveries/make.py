# Southline police livery textures, laid out like the source decals of Sedan 11 (stored flipped vertically, as the source)
from PIL import Image, ImageDraw, ImageFont
F = '/System/Library/Fonts/Supplemental/'
def text(d, xy, s, font, fill, stroke=0, sfill=None):
    d.text(xy, s, font=font, fill=fill, anchor='mm', stroke_width=stroke, stroke_fill=sfill)
# door: white field, black POLICE with a red keyline, SOUTHLINE above, unit stripe below
im = Image.new('RGBA', (1024, 1024), (255, 255, 255, 255)); d = ImageDraw.Draw(im)
big = ImageFont.truetype(F + 'Arial Black.ttf', 150); sm = ImageFont.truetype(F + 'DIN Alternate Bold.ttf', 58)
text(d, (512, 499), 'POLICE', big, (12, 12, 14), 7, (178, 18, 27))
text(d, (512, 612), 'SOUTHLINE', sm, (12, 12, 14))
im.transpose(Image.FLIP_TOP_BOTTOM).save('police_door.png')
# hood: near-black field, white POLICE with red keyline, SOUTHLINE PD above
im = Image.new('RGBA', (1024, 1024), (15, 15, 15, 255)); d = ImageDraw.Draw(im)
text(d, (600, 334), 'POLICE', ImageFont.truetype(F + 'Arial Black.ttf', 140), (245, 245, 245), 7, (178, 18, 27))
text(d, (600, 909), 'SOUTHLINE PD', ImageFont.truetype(F + 'DIN Alternate Bold.ttf', 64), (245, 245, 245))
im.transpose(Image.FLIP_TOP_BOTTOM).save('police_hood.png')
print('ok')

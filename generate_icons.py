from PIL import Image, ImageDraw
import os

# Create images directory if it doesn't exist
os.makedirs('images', exist_ok=True)

# Sizes we need
sizes = [16, 48, 128]

# Colors
background_color = (66, 133, 244)  # Google Blue
foreground_color = (255, 255, 255)  # White

for size in sizes:
    # Create a new image with a transparent background
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Draw background circle
    margin = size // 10
    draw.ellipse([margin, margin, size - margin, size - margin], fill=background_color)
    
    # Draw clock face
    clock_margin = size // 4
    draw.ellipse([clock_margin, clock_margin, size - clock_margin, size - clock_margin], 
                 fill=foreground_color)
    
    # Draw clock hands
    center = size // 2
    # Hour hand
    draw.line([center, center, center, center - size//4], 
              fill=background_color, width=max(1, size//32))
    # Minute hand
    draw.line([center, center, center + size//4, center], 
              fill=background_color, width=max(1, size//32))
    
    # Draw document lines
    doc_top = center + size//8
    doc_height = size//8
    for i in range(3):
        y = doc_top + i * doc_height
        draw.rectangle([center - size//4, y, center + size//4, y + doc_height//2], 
                      fill=background_color)
    
    # Save the image
    img.save(f'images/icon{size}.png')
    print(f'Generated icon{size}.png') 
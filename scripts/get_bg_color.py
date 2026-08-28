"""Muestrea el color de fondo (esquinas) de una imagen PNG y lo imprime en HEX."""
import sys
from PIL import Image

def main(path):
    img = Image.open(path).convert("RGB")
    w, h = img.size
    corners = [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3)]
    samples = [img.getpixel(c) for c in corners]
    r = sum(s[0] for s in samples) // len(samples)
    g = sum(s[1] for s in samples) // len(samples)
    b = sum(s[2] for s in samples) // len(samples)
    print(f"RGB promedio de esquinas: ({r}, {g}, {b})")
    print(f"HEX: #{r:02x}{g:02x}{b:02x}")

if __name__ == "__main__":
    main(sys.argv[1])

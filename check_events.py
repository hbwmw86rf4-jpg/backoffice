import os
import glob
import xml.etree.ElementTree as ET

booutbox = r'\\10.5.48.2\XMLGateway\BOOutBox'
pjr_files = glob.glob(os.path.join(booutbox, 'PJR*.xml'))

events = set()
for f in pjr_files[:10]:
    try:
        tree = ET.parse(f)
        root = tree.getroot()
        for elem in root.iter():
            tag = elem.tag.split('}')[-1]
            if tag.endswith('Event'):
                events.add(tag)
    except:
        pass

print("Events found:", events)

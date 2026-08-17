import os
import sys

# Append argument pointing to BOOutBox staging
sys.argv = ['rs_xml_parser.py', r'C:\Users\shell\Documents\office\backoffice\data\staging\BOOutBox']

# Import and run rs_xml_parser
import rs_xml_parser
rs_xml_parser.main()

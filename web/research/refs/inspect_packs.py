import io
import requests
import zipfile

for slug in [
    'city-kit-suburban', 'city-kit-commercial', 'car-kit', 'nature-kit',
    'animated-characters-survivors', 'retro-urban-kit', 'city-kit-industrial',
    'animated-characters-protagonists', 'survival-kit',
]:
    page = requests.get('https://kenney.nl/assets/' + slug, timeout=30).text
    urls = [x.split("'")[0] for x in page.split("href='")
            if x.startswith('https://kenney.nl/media/pages/assets/') and '.zip' in x]
    if not urls:
        print(slug, 'NO ZIP')
        continue
    data = requests.get(urls[0], timeout=30).content
    archive = zipfile.ZipFile(io.BytesIO(data))
    glbs = [n for n in archive.namelist() if n.endswith('.glb')]
    print('\n', slug, 'zip bytes', len(data), 'glbs', len(glbs))
    print(' | '.join(n.rsplit('/', 1)[-1] for n in glbs[:100]))

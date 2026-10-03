#!/usr/bin/env python3
"""Validate the Git index (or a revision), resource inventory and repository boundaries."""
import argparse
import hashlib
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
BINARY = {'.stl','.png','.jpg','.jpeg','.webp','.ico','.otf','.ttf','.woff','.woff2','.glb','.webm','.pdf','.zip','.dat'}
FORBIDDEN_ROOTS = {'generated','.local','.tools','.jj','artifacts','stl','viewer','cad','engineering','bench'}
FORBIDDEN_PARTS = {'node_modules','target','build','dist','.dart_tool','ephemeral','__pycache__'}
LFS = re.compile(rb'version https://git-lfs.github.com/spec/v1\noid sha256:([0-9a-f]{64})\nsize ([0-9]+)\n\Z')

def validate_blob(name, data, registry):
    errors = []
    p = pathlib.PurePosixPath(name)
    if p.parts[0] in FORBIDDEN_ROOTS or any(part in FORBIDDEN_PARTS for part in p.parts):
        errors.append(f'Tracked cache/output: {name}')
    if name.startswith(('apps/workbench/public/','apps/simulator/public/','apps/simulator/src-tauri/icons/')):
        errors.append(f'Tracked prepared resource: {name}')
    binary = p.suffix.lower() in BINARY or b'\0' in data
    pointer = LFS.fullmatch(data)
    if binary or pointer:
        if not name.startswith('assets/'):
            errors.append(f'Binary outside assets/: {name}')
        if not pointer:
            errors.append(f'Binary is not an LFS pointer: {name}')
        elif name not in registry['files']:
            errors.append(f'Unregistered LFS resource: {name}')
        else:
            expected = registry['files'][name]
            if pointer[1].decode()!=expected['sha256'] or int(pointer[2])!=expected['bytes']:
                errors.append(f'LFS pointer differs from resource inventory: {name}')
    if len(data)>1048576 and not pointer:
        errors.append(f'Ordinary Git file exceeds 1 MiB: {name}')
    return errors

def git(*args, **kwargs):
    return subprocess.check_output(['git',*args],cwd=ROOT,**kwargs)

def blobs(revision=None):
    if revision:
        entries=git('ls-tree','-r','-z',revision).split(b'\0')
        return {name.decode():fields.split()[2].decode() for entry in entries if entry for fields,name in [entry.split(b'\t',1)] if fields.split()[1]==b'blob'}
    entries=git('ls-files','--stage','-z').split(b'\0')
    result={}
    for entry in entries:
        if not entry:continue
        fields,name=entry.split(b'\t',1)
        if fields.split()[2]!=b'0':raise ValueError(f'Unmerged index entry: {name.decode()}')
        result[name.decode()]=fields.split()[1].decode()
    return result

def read_blobs(entries):
    proc=subprocess.Popen(['git','cat-file','--batch'],cwd=ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE)
    # communicate avoids pipe deadlocks when reading a large inventory.
    output,_=proc.communicate(('\n'.join(entries.values())+'\n').encode())
    if proc.returncode:raise RuntimeError('git cat-file failed')
    pos=0;result={}
    for name in entries:
        end=output.index(b'\n',pos);header=output[pos:end].split();size=int(header[2]);pos=end+1
        result[name]=output[pos:pos+size];pos+=size+1
    return result

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--revision');args=parser.parse_args()
    contents=read_blobs(blobs(args.revision))
    if 'assets/manifest.json' not in contents:raise ValueError('Resource inventory is not tracked')
    registry=json.loads(contents['assets/manifest.json']);errors=[]
    for name,data in contents.items():errors.extend(validate_blob(name,data,registry))
    for name,expected in registry['files'].items():
        if name not in contents:errors.append(f'Inventory resource is not tracked: {name}');continue
        data=contents[name]
        if not LFS.fullmatch(data) and (hashlib.sha256(data).hexdigest()!=expected['sha256'] or len(data)!=expected['bytes']):
            errors.append(f'Inventory differs from tracked content: {name}')
    for name,data in contents.items():
        if not name.endswith('.md'):continue
        for target in re.findall(r'\]\(([^)]+)\)',data.decode('utf8')):
            target=target.split('#',1)[0]
            if not target or '://' in target or target.startswith(('mailto:','/')):continue
            resolved=(ROOT/pathlib.PurePosixPath(name).parent/target).resolve()
            if not resolved.is_relative_to(ROOT):errors.append(f'Link escapes repository: {name} -> {target}');continue
            relative=str(resolved.relative_to(ROOT))
            if relative.startswith(('generated/','.local/')):continue
            if relative not in contents and not any(p.startswith(relative.rstrip('/')+'/') for p in contents):
                errors.append(f'Broken tracked documentation link: {name} -> {target}')
    if errors:
        print('\n'.join(errors),file=sys.stderr);return 1
    print(f'PASS: {len(contents)} tracked files, {len(registry["files"])} registered resources; no tracked caches, ordinary binaries or oversized files')
    return 0

if __name__=='__main__':
    try:sys.exit(main())
    except (ValueError,RuntimeError,subprocess.CalledProcessError) as error:print(error,file=sys.stderr);sys.exit(1)

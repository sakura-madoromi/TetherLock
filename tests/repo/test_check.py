import importlib.util
import pathlib
import unittest

spec=importlib.util.spec_from_file_location('repo_check',pathlib.Path(__file__).resolve().parents[2]/'scripts/repo/check.py')
check=importlib.util.module_from_spec(spec);spec.loader.exec_module(check)

class RepositoryBoundaries(unittest.TestCase):
    def test_binary_and_generated_files_cannot_escape_policy(self):
        for name,data in [('apps/controller/icon.png',b'\x89PNG\0'),('generated/result.json',b'{}'),('packages/core/target/data',b'cache')]:
            self.assertTrue(check.validate_blob(name,data,{'files':{}}),name)

    def test_pointer_must_match_registered_content(self):
        name='assets/cad/v3/assembly/base.stl';oid='a'*64
        data=f'version https://git-lfs.github.com/spec/v1\noid sha256:{oid}\nsize 42\n'.encode()
        registry={'files':{name:{'sha256':oid,'bytes':42}}}
        self.assertEqual(check.validate_blob(name,data,registry),[])
        registry['files'][name]['bytes']=43
        self.assertTrue(check.validate_blob(name,data,registry))
        self.assertTrue(check.validate_blob(name,data,{'files':{}}))

    def test_ascii_stl_and_large_text_are_rejected(self):
        self.assertTrue(check.validate_blob('assets/cad/test.stl',b'solid shape\nendsolid shape',{'files':{}}))
        self.assertTrue(check.validate_blob('docs/dump.txt',b'x'*1048577,{'files':{}}))

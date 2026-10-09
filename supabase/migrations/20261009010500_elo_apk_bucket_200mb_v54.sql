-- Elo App Factory: APKs Android universais incluem bibliotecas nativas e podem
-- ultrapassar 100 MB. O APK Adoradores compilado ocupa aproximadamente 117 MB.
-- Mantenha o bucket privado e libere até 200 MB por artefato.
-- Além desta restrição é necessário que o limite GLOBAL do Storage seja >=200 MB.
update storage.buckets
set file_size_limit = 200000000
where id = 'elo-church-apks' and file_size_limit < 200000000;

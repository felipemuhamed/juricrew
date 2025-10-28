package com.company.aiapp.service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import com.company.aiapp.entity.AppUser;
import com.company.aiapp.entity.Project;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class ProjectIndexServiceImpl implements ProjectIndexService {
  private static final Logger log = LoggerFactory.getLogger(ProjectIndexServiceImpl.class);

  // Safety limits (mirror your extension defaults)
  private static final long MAX_FILE_BYTES = 1024L * 1024L * 2L; // 2 MB hard cap, adjust as needed

  @Override
  public void indexZip(AppUser owner, Project project, InputStream zipStream) throws IOException {
    try (ZipInputStream zin = new ZipInputStream(zipStream, StandardCharsets.UTF_8)) {
      ZipEntry entry;
      int files = 0;
      while ((entry = zin.getNextEntry()) != null) {
        if (entry.isDirectory()) continue;
        String path = entry.getName();

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        long written = 0;
        int n;
        while ((n = zin.read(buf)) > 0) {
          written += n;
          if (written > MAX_FILE_BYTES) {
            // skip very large single files; your extension should already avoid them
            baos.reset();
            break;
          }
          baos.write(buf, 0, n);
        }
        byte[] content = baos.toByteArray();
        if (content.length == 0) continue;

        // TODO: Push (project, path, content) to your embedding/index pipeline here.
        // For now, just log.
        log.info("Indexing file for project {} ({}): {} ({} bytes)",
            project.getId(), project.getName(), path, content.length);

        files++;
        zin.closeEntry();
      }
      log.info("Indexed {} files for project {} ({})", files, project.getId(), project.getName());
    }
  }
}
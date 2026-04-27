package redlib.backend.service;

import redlib.backend.dto.NotebookNoteDTO;
import redlib.backend.dto.query.NotebookNoteQueryDTO;
import redlib.backend.model.Page;
import redlib.backend.vo.NotebookNoteVO;

import java.util.List;

public interface NotebookNoteService {
    Page<NotebookNoteVO> list(NotebookNoteQueryDTO queryDTO);

    NotebookNoteVO get(Integer id);

    Integer add(NotebookNoteDTO noteDTO);

    Integer update(NotebookNoteDTO noteDTO);

    Integer updateFavorite(NotebookNoteDTO noteDTO);

    void delete(List<Integer> ids);

    String getOwnedNoteContent(Integer noteId);
}

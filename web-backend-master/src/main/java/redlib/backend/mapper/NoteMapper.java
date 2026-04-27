package redlib.backend.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import redlib.backend.model.Note;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface NoteMapper extends BaseMapper<Note> {
    // 基础的增删改查功能已获得
}